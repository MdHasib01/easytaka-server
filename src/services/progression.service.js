import { MAX_LEVEL, XP_PER_LEVEL } from '../constants.js';
import { Smm, SocialAccount } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { DAY_MS, dayKey } from '../utils/dates.js';
import { notify } from './notification.service.js';
import { credit } from './wallet.service.js';

export const levelForXp = (xp) => Math.min(MAX_LEVEL, Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1);

export function assertJobHolder(smm) {
  if (!smm.jobHolderUnlocked) {
    throw ApiError.forbidden('Complete your Job Holder milestone to unlock missions and rapid tasks', {
      code: 'JOB_HOLDER_LOCKED',
    });
  }
}

export async function addXp(smmId, amount) {
  if (!amount) return Smm.findById(smmId);

  const smm = await Smm.findByIdAndUpdate(
    smmId,
    { $inc: { lifetimeXp: amount, redeemableXp: amount } },
    { returnDocument: 'after' },
  );
  if (!smm) return null;

  const level = levelForXp(smm.lifetimeXp);
  if (level !== smm.level) {
    await Smm.updateOne({ _id: smm._id }, { $set: { level } });
    if (level > smm.level) {
      await notify(smm.user, 'Level Up!', `You reached Level ${level}. Keep going!`, 'success');
    }
    smm.level = level;
  }
  return smm;
}

/** Updates review counters and recomputes the SMM's quality score (approval rate). */
export async function recordReviewOutcome(smmId, action) {
  const field = {
    Approve: 'reviewStats.approved',
    Revision: 'reviewStats.revision',
    Reject: 'reviewStats.rejected',
  }[action];
  const smm = await Smm.findByIdAndUpdate(
    smmId,
    { $inc: { [field]: 1 } },
    { returnDocument: 'after' },
  );
  if (!smm) return;
  const { approved, revision, rejected } = smm.reviewStats;
  const total = approved + revision + rejected;
  const qualityScore = total ? Math.round((approved / total) * 100) : 100;
  await Smm.updateOne({ _id: smmId }, { $set: { qualityScore } });
}

/** Counts consecutive business days with activity. */
export async function touchStreak(smmId) {
  const today = dayKey();
  const smm = await Smm.findById(smmId).select('currentStreak lastActiveDay');
  if (!smm || smm.lastActiveDay === today) return;

  const yesterday = dayKey(Date.now() - DAY_MS);
  const currentStreak = smm.lastActiveDay === yesterday ? smm.currentStreak + 1 : 1;
  await Smm.updateOne(
    { _id: smmId, lastActiveDay: smm.lastActiveDay ?? null },
    { $set: { currentStreak, lastActiveDay: today } },
  );
}

/** Recomputes managed / approved ID counters from the SocialAccount collection. */
export async function syncSmmStats(smmId) {
  const [managedIds, approvedEnrichedIds] = await Promise.all([
    SocialAccount.countDocuments({ smm: smmId }),
    SocialAccount.countDocuments({ smm: smmId, status: 'Eligible' }),
  ]);

  const before = await Smm.findByIdAndUpdate(
    smmId,
    { $set: { managedIds, approvedEnrichedIds } },
    { returnDocument: 'before' },
  ).populate('brand', 'settings');
  if (!before) return null;

  const threshold = before.brand?.settings?.jobHolderThreshold ?? 20;
  if (
    !before.jobHolderBonusClaimed &&
    before.approvedEnrichedIds < threshold &&
    approvedEnrichedIds >= threshold
  ) {
    await notify(
      before.user,
      'Job Holder Milestone Reached 🎉',
      `You now have ${approvedEnrichedIds} approved IDs. Claim your Job Holder bonus to unlock missions.`,
      'success',
      '/smm/home',
    );
  }
  return { managedIds, approvedEnrichedIds };
}

export async function claimJobHolderBonus(smmId) {
  const smm = await Smm.findById(smmId).populate('brand', 'settings');
  const { jobHolderThreshold, jobHolderBonusCash, jobHolderBonusXp } = smm.brand.settings;

  const claimed = await Smm.findOneAndUpdate(
    {
      _id: smmId,
      jobHolderBonusClaimed: { $ne: true },
      approvedEnrichedIds: { $gte: jobHolderThreshold },
    },
    { $set: { jobHolderUnlocked: true, jobHolderBonusClaimed: true, jobHolderSince: new Date() } },
    { returnDocument: 'after' },
  );
  if (!claimed) {
    if (smm.jobHolderBonusClaimed) throw ApiError.conflict('Job Holder bonus already claimed');
    throw ApiError.badRequest(
      `You need ${jobHolderThreshold} approved IDs to claim this bonus (currently ${smm.approvedEnrichedIds})`,
    );
  }

  await addXp(smmId, jobHolderBonusXp);
  await credit(smmId, {
    brand: smm.brand._id,
    amount: jobHolderBonusCash,
    category: 'bonus',
    title: 'Job Holder Milestone Bonus',
    description: `${jobHolderThreshold} Approved IDs Achieved`,
    reference: `jobholder:${smmId}`,
  });
  await notify(
    claimed.user,
    "You're now an EasyTaka Job Holder",
    'Regular missions, rapid tasks and weekly salary are now unlocked.',
    'success',
  );
  return Smm.findById(smmId);
}

export function careerSummary(smm) {
  const { level, lifetimeXp, redeemableXp, currentStreak, qualityScore } = smm;
  const { approved = 0, revision = 0, rejected = 0 } = smm.reviewStats || {};
  const totalReviews = approved + revision + rejected;
  const currentLevelXp = (level - 1) * XP_PER_LEVEL;
  const nextLevelXp = level >= MAX_LEVEL ? null : level * XP_PER_LEVEL;
  const levelProgress = nextLevelXp
    ? Math.min(100, Math.round(((lifetimeXp - currentLevelXp) / XP_PER_LEVEL) * 100))
    : 100;

  const badges = [
    { key: 'first-eligible', title: 'First Eligible ID', tier: 1, earned: smm.approvedEnrichedIds >= 1 },
    { key: 'ten-eligible', title: '10 Eligible IDs', tier: 2, earned: smm.approvedEnrichedIds >= 10 },
    { key: 'job-holder', title: 'Job Holder', tier: 3, earned: smm.jobHolderUnlocked },
    { key: 'streak-7', title: '7-Day Streak', tier: 1, earned: currentStreak >= 7 },
    { key: 'streak-30', title: '30-Day Streak', tier: 3, earned: currentStreak >= 30 },
    { key: 'quality-pro', title: 'Quality Pro (90%+)', tier: 2, earned: qualityScore >= 90 && totalReviews >= 10 },
    { key: 'level-5', title: 'Level 5', tier: 2, earned: level >= 5 },
    { key: 'max-level', title: 'Max Level', tier: 4, earned: level >= MAX_LEVEL },
  ];

  return {
    level,
    maxLevel: MAX_LEVEL,
    lifetimeXp,
    redeemableXp,
    currentLevelXp,
    nextLevelXp,
    maxXp: MAX_LEVEL * XP_PER_LEVEL,
    levelProgress,
    currentStreak,
    qualityScore,
    reviewStats: { approved, revision, rejected, total: totalReviews },
    badges,
  };
}
