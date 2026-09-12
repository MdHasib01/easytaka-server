import { SUBMITTABLE_STAGE_STATUSES } from '../constants.js';
import { Brand, Smm } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from './notification.service.js';
import { addXp, recordReviewOutcome, syncSmmStats, touchStreak } from './progression.service.js';
import { credit } from './wallet.service.js';

/** Snapshot of the brand's active stages for a new account: first stage open, rest locked. */
export function buildStagesFromBrand(brand) {
  return brand.enrichmentStages
    .filter((s) => s.active)
    .map((s, i) => ({
      id: s.id,
      name: s.name,
      weight: s.weight,
      xpReward: s.xpReward,
      required: s.required,
      requirement: { type: s.requirement?.type ?? 'none', min: s.requirement?.min ?? 0 },
      checklist: s.checklist.map((c) => ({ id: c.id, label: c.label, checked: false })),
      status: i === 0 ? 'Available' : 'Locked',
    }));
}

export const approvedWeight = (stages) =>
  Math.min(
    100,
    stages.filter((s) => s.status === 'Approved').reduce((sum, s) => sum + (s.weight || 0), 0),
  );

function deriveApprovalStatus(stages) {
  if (stages.some((s) => s.status === 'Revision Required')) return 'Revision Required';
  if (stages.some((s) => s.status === 'Under Review')) return 'Under Review';
  if (stages.some((s) => s.status === 'Approved')) return 'Approved';
  return null;
}

/** Recomputes enrichmentPercent / approvalStatus / status from the stages. Returns the percent. */
export function refreshAccountState(account) {
  const percent = approvedWeight(account.stages);
  account.enrichmentPercent = percent;
  account.approvalStatus = deriveApprovalStatus(account.stages);

  if (account.status !== 'Locked') {
    const touched = account.stages.some((s) =>
      ['Under Review', 'Approved', 'Revision Required'].includes(s.status),
    );
    if (percent >= 100) account.status = 'Eligible';
    else if (account.stages.some((s) => s.status === 'Revision Required')) account.status = 'Revision Required';
    else if (account.status === 'New' && !touched) account.status = 'New';
    else account.status = 'Enrichment Started';
  }
  return percent;
}

/** Returns a human-readable reason when a stage's prerequisites are not met, else null. */
export function checkStageRequirement(account, stage) {
  const { type = 'none', min = 0 } = stage.requirement || {};
  if (type === 'personaComplete') {
    const completeness = account.persona?.completeness || 0;
    if (completeness < Math.max(min, 100)) {
      return `Persona must be 100% complete before submitting this stage (currently ${completeness}%)`;
    }
  }
  if (type === 'contentEntries') {
    const count = account.contentEntries?.length || 0;
    if (count < min) return `At least ${min} content entries are required (currently ${count})`;
  }
  if (type === 'notes') {
    const count = account.notes?.length || 0;
    if (count < min) return `At least ${min} persona notes are required (currently ${count})`;
  }
  return null;
}

function findStage(account, stageId) {
  const index = account.stages.findIndex((s) => s.id === stageId);
  if (index === -1) throw ApiError.notFound(`Stage ${stageId} not found on this account`);
  return { stage: account.stages[index], index };
}

export async function submitStage({ account, stageId, proof, actor }) {
  if (account.status === 'Locked') throw ApiError.forbidden('This account is locked');
  const { stage } = findStage(account, stageId);

  if (!SUBMITTABLE_STAGE_STATUSES.includes(stage.status)) {
    throw ApiError.conflict(`"${stage.name}" cannot be submitted while ${stage.status}`);
  }
  const blocked = checkStageRequirement(account, stage);
  if (blocked) throw ApiError.badRequest(blocked, { code: 'STAGE_REQUIREMENT' });
  if (stage.checklist.length && !proof.checklistConfirmed) {
    throw ApiError.badRequest('All checklist items must be confirmed before submitting');
  }

  const percent = approvedWeight(account.stages);
  stage.checklist.forEach((c) => {
    c.checked = true;
  });
  stage.status = 'Under Review';
  stage.submission = {
    screenshots: proof.screenshots ?? [],
    profileUrl: proof.profileUrl,
    notes: proof.notes,
    relatedProduct: proof.relatedProduct,
    checklistConfirmed: true,
    date: new Date(),
    status: 'Submitted',
  };
  account.history.unshift({
    stageId: stage.id,
    stageName: stage.name,
    status: 'Submitted',
    reviewer: actor.name,
    reviewerId: actor._id,
    note: proof.notes,
    progressBefore: percent,
    progressAfter: percent,
  });
  if (account.status === 'New') account.status = 'Enrichment Started';
  refreshAccountState(account);
  account.lastActivityAt = new Date();
  await account.save();

  await notify(
    actor._id,
    'Proof Submitted',
    `${stage.name} proof for ${account.name} has been submitted for review.`,
    'info',
  );
  await touchStreak(account.smm);
  return account;
}

const MILESTONES = [
  [50, 'Enrichment Progress', 'Halfway there. Keep going!'],
  [80, 'Enrichment Progress', 'Almost ready.'],
  [90, 'Final Review Unlocked', 'Final eligibility review unlocked.'],
];

export async function reviewStage({ account, stageId, action, note, reviewer }) {
  const { stage, index } = findStage(account, stageId);
  if (stage.status !== 'Under Review') {
    throw ApiError.conflict(`Only stages under review can be reviewed ("${stage.name}" is ${stage.status})`);
  }

  const before = approvedWeight(account.stages);
  stage.submission ??= { status: 'Submitted', date: new Date() };
  stage.submission.reviewedBy = reviewer._id;
  stage.submission.reviewedAt = new Date();

  if (action === 'Approve') {
    stage.status = 'Approved';
    stage.submission.status = 'Approved';
    stage.submission.reviewerNote = note;
    const next = account.stages[index + 1];
    if (next?.status === 'Locked') next.status = 'Available';
  } else if (action === 'Revision') {
    stage.status = 'Revision Required';
    stage.submission.status = 'Revision';
    stage.submission.reviewerNote = note || 'Please update the requested fields.';
  } else {
    // Reject resets the stage so it has to be redone from scratch.
    stage.status = 'Available';
    stage.submission.status = 'Rejected';
    stage.submission.reviewerNote = note || 'Stage rejected. Please restart.';
    stage.checklist.forEach((c) => {
      c.checked = false;
    });
  }

  const after = refreshAccountState(account);
  const xpAwarded = action === 'Approve' ? stage.xpReward : 0;
  account.history.unshift({
    stageId: stage.id,
    stageName: stage.name,
    status: { Approve: 'Approved', Revision: 'Revision Required', Reject: 'Rejected' }[action],
    reviewer: reviewer.name,
    reviewerId: reviewer._id,
    note: stage.submission.reviewerNote,
    xpAwarded,
    progressBefore: before,
    progressAfter: after,
  });

  const grantFullReward = after >= 100 && !account.fullEnrichmentRewardGranted;
  if (grantFullReward) account.fullEnrichmentRewardGranted = true;

  // Version check (optimisticConcurrency) rejects a concurrent review of the same account.
  await account.save();

  // Side effects run only after the account write succeeded.
  const smm = await Smm.findById(account.smm).select('user brand');
  const userId = smm?.user;

  if (action === 'Approve') {
    await addXp(account.smm, xpAwarded);
    await notify(userId, 'Stage Approved', `${stage.name} was approved for ${account.name}. +${xpAwarded} XP.`, 'success');
    for (const [threshold, title, message] of MILESTONES) {
      if (before < threshold && after >= threshold && after < 100) await notify(userId, title, message, 'info');
    }
    if (after >= 100) {
      await notify(userId, 'Account Eligible', `${account.name} is now Eligible for missions.`, 'success');
    }
  } else if (action === 'Revision') {
    await notify(userId, 'Revision Required', `${stage.name} for ${account.name} needs revision. Check the feedback.`, 'warning');
  } else {
    await notify(userId, 'Stage Rejected', `${stage.name} for ${account.name} was rejected.`, 'error');
  }

  if (grantFullReward) {
    const brand = await Brand.findById(account.brand).select('settings');
    const amount = brand?.settings?.fullEnrichmentReward ?? 0;
    const tx = await credit(account.smm, {
      brand: account.brand,
      amount,
      category: 'enrichment_reward',
      title: `ID #${account.serial} Full Enrichment Reward`,
      description: 'Approved',
      reference: `enrichment:${account._id}`,
    });
    if (tx) await notify(userId, 'Reward Earned', `Earned ৳${amount} for Full Enrichment!`, 'success');
  }

  await recordReviewOutcome(account.smm, action);
  await syncSmmStats(account.smm);
  return account;
}
