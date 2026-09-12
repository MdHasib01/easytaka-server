import { Mission, Smm, SocialAccount, Submission } from '../models/index.js';
import { sameId } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { periodKeyFor } from '../utils/dates.js';
import { notify } from './notification.service.js';
import { addXp, assertJobHolder, recordReviewOutcome, touchStreak } from './progression.service.js';
import { credit } from './wallet.service.js';

const STATUS_KEYS = {
  'In Progress': 'inProgress',
  Submitted: 'submitted',
  'Revision Required': 'revision',
  Completed: 'completed',
};

/** Slot usage for each mission in its *current* period. */
export async function missionProgress(missions) {
  const result = new Map(
    missions.map((m) => [
      String(m._id),
      { inProgress: 0, submitted: 0, revision: 0, completed: 0, taken: 0, total: m.targetCompletions },
    ]),
  );
  if (!missions.length) return result;

  const rows = await Submission.aggregate([
    {
      $match: {
        $or: missions.map((m) => ({ mission: m._id, periodKey: periodKeyFor(m.recurrence) })),
      },
    },
    { $group: { _id: { mission: '$mission', status: '$status' }, count: { $sum: 1 } } },
  ]);

  for (const { _id, count } of rows) {
    const progress = result.get(String(_id.mission));
    const key = STATUS_KEYS[_id.status];
    if (progress && key) {
      progress[key] += count;
      progress.taken += count;
    }
  }
  return result;
}

export function assertMissionOpenForSmm(mission, smm) {
  if (!sameId(mission.brand, smm.brand)) throw ApiError.forbidden('This mission belongs to another brand');
  if (mission.status !== 'Active') throw ApiError.conflict(`This mission is ${mission.status.toLowerCase()}`);
  if (mission.startsAt && mission.startsAt > new Date()) throw ApiError.conflict('This mission has not started yet');
  if (mission.isExpired) throw ApiError.conflict('The deadline for this mission has passed');
  if (
    mission.assignTo === 'Specific SMMs' &&
    !mission.assignedSmms.some((id) => sameId(id, smm._id))
  ) {
    throw ApiError.forbidden('This mission is not assigned to you');
  }
  if (mission.assignTo === 'Tier' && smm.level < (mission.minLevel || 1)) {
    throw ApiError.forbidden(`This mission requires level ${mission.minLevel} or higher`);
  }
}

/** SMM starts a mission (one ID) or accepts a rapid task (requiredIds IDs). */
export async function startExecution({ mission, smm, accountIds }) {
  assertJobHolder(smm);
  assertMissionOpenForSmm(mission, smm);

  const ids = [...new Set(accountIds.map(String))];
  if (mission.isRapid && ids.length < mission.requiredIds) {
    throw ApiError.badRequest(`This task needs ${mission.requiredIds} eligible IDs`);
  }
  if (!mission.isRapid && ids.length !== 1) {
    throw ApiError.badRequest('Select exactly one eligible ID to execute this mission');
  }

  const owned = await SocialAccount.countDocuments({ _id: { $in: ids }, smm: smm._id, status: 'Eligible' });
  if (owned !== ids.length) {
    throw ApiError.badRequest('All selected IDs must be your own fully enriched (Eligible) accounts');
  }

  const periodKey = periodKeyFor(mission.recurrence);
  const taken = await Submission.countDocuments({
    mission: mission._id,
    periodKey,
    status: { $ne: 'Rejected' },
  });
  if (taken >= mission.targetCompletions) {
    throw ApiError.conflict('No completion slots are left for this period');
  }

  const dedupeKey = mission.isRapid
    ? `${mission._id}:${smm._id}`
    : `${mission._id}:${ids[0]}:${periodKey}`;

  try {
    return await Submission.create({
      brand: mission.brand,
      mission: mission._id,
      isRapid: mission.isRapid,
      smm: smm._id,
      accounts: ids,
      periodKey,
      dedupeKey,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict(
        mission.isRapid
          ? 'You have already accepted this task'
          : 'This ID has already taken this mission for the current period',
      );
    }
    throw err;
  }
}

export async function submitExecution({ submission, proof }) {
  if (!['In Progress', 'Revision Required'].includes(submission.status)) {
    throw ApiError.conflict(`Cannot submit while ${submission.status}`);
  }
  const mission = await Mission.findById(submission.mission);
  if (!mission) throw ApiError.notFound('This mission no longer exists');
  if (mission.isExpired) throw ApiError.conflict('The deadline for this mission has passed');
  if (!proof.url && !proof.screenshots?.length && !proof.notes) {
    throw ApiError.badRequest('Provide a proof link, screenshots or notes');
  }

  submission.proof = proof;
  submission.status = 'Submitted';
  submission.submittedAt = new Date();
  submission.reviewerNote = undefined;
  await submission.save();
  await touchStreak(submission.smm);
  return submission;
}

export async function reviewExecution({ submission, action, note, reviewer }) {
  if (submission.status !== 'Submitted') {
    throw ApiError.conflict('Only submitted work can be reviewed');
  }
  const mission = await Mission.findById(submission.mission);
  const title = mission?.title ?? 'Mission';

  submission.reviewedBy = reviewer._id;
  submission.reviewedAt = new Date();
  submission.reviewerNote = note;

  if (action === 'Approve') {
    submission.status = 'Completed';
    submission.rewardPaid = mission?.reward ?? 0;
    submission.xpAwarded = mission?.xpReward ?? 0;
  } else if (action === 'Revision') {
    submission.status = 'Revision Required';
    submission.reviewerNote = note || 'Please update your proof and resubmit.';
  } else {
    submission.status = 'Rejected';
    submission.reviewerNote = note || 'Submission rejected.';
    // Free the slot so the SMM / ID can take the mission again this period.
    submission.dedupeKey = `${submission.dedupeKey}:rejected:${submission._id}`;
  }
  await submission.save();

  const smm = await Smm.findById(submission.smm).select('user');
  if (action === 'Approve') {
    const updated = await Mission.findByIdAndUpdate(
      submission.mission,
      { $inc: { completedCount: 1 } },
      { returnDocument: 'after' },
    );
    if (
      updated &&
      updated.recurrence === 'One-time' &&
      updated.completedCount >= updated.targetCompletions
    ) {
      await Mission.updateOne({ _id: updated._id, status: 'Active' }, { $set: { status: 'Completed' } });
    }
    await addXp(submission.smm, submission.xpAwarded);
    await credit(submission.smm, {
      brand: submission.brand,
      amount: submission.rewardPaid,
      category: submission.isRapid ? 'rapid_reward' : 'mission_reward',
      title: submission.isRapid ? 'Rapid Task Reward' : 'Mission Reward',
      description: title,
      reference: `submission:${submission._id}`,
    });
    await notify(
      smm?.user,
      'Submission Approved',
      `"${title}" was approved. +৳${submission.rewardPaid} and +${submission.xpAwarded} XP.`,
      'success',
    );
  } else if (action === 'Revision') {
    await notify(smm?.user, 'Revision Required', `"${title}" needs changes: ${submission.reviewerNote}`, 'warning');
  } else {
    await notify(smm?.user, 'Submission Rejected', `"${title}" was rejected: ${submission.reviewerNote}`, 'error');
  }

  await recordReviewOutcome(submission.smm, action);
  return submission;
}
