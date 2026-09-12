import { Mission, Product, Smm, SocialAccount, Submission, Transaction } from '../models/index.js';
import { DAY_MS, dayKey, startOfDay, startOfWeek, tzString } from '../utils/dates.js';

/** Data for the Brand Workspace overview tab and header counters. */
export async function brandOverview(brand) {
  const brandId = brand._id;
  const chartStart = new Date(startOfDay().getTime() - 6 * DAY_MS);

  const [
    totalProducts,
    smms,
    accountStatusRows,
    [pendingEnrichmentRow],
    pendingSubmissionRows,
    completionRows,
    [weekRewardsRow],
    dailyMissions,
  ] = await Promise.all([
    Product.countDocuments({ brand: brandId, status: 'Active' }),
    Smm.find({ brand: brandId, status: 'Active' })
      .select('user qualityScore jobHolderUnlocked lastActiveDay')
      .populate('user', 'name'),
    SocialAccount.aggregate([
      { $match: { brand: brandId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    SocialAccount.aggregate([
      { $match: { brand: brandId, 'stages.status': 'Under Review' } },
      { $unwind: '$stages' },
      { $match: { 'stages.status': 'Under Review' } },
      { $count: 'count' },
    ]),
    Submission.aggregate([
      { $match: { brand: brandId, status: 'Submitted' } },
      { $group: { _id: '$isRapid', count: { $sum: 1 } } },
    ]),
    Submission.aggregate([
      { $match: { brand: brandId, status: 'Completed', reviewedAt: { $gte: chartStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$reviewedAt', timezone: tzString } },
          count: { $sum: 1 },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $match: {
          brand: brandId,
          type: 'credit',
          status: 'Completed',
          category: { $nin: ['salary', 'adjustment'] },
          createdAt: { $gte: startOfWeek() },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Mission.find({ brand: brandId, isRapid: false, status: 'Active', recurrence: 'Daily' }).select(
      'targetCompletions',
    ),
  ]);

  const accountsByStatus = Object.fromEntries(accountStatusRows.map((r) => [r._id, r.count]));
  const managedIds = accountStatusRows.reduce((sum, r) => sum + r.count, 0);
  const pendingEnrichment = pendingEnrichmentRow?.count ?? 0;
  const pendingMissionReviews = pendingSubmissionRows.find((r) => !r._id)?.count ?? 0;
  const pendingRapidReviews = pendingSubmissionRows.find((r) => r._id)?.count ?? 0;

  const completions = new Map(completionRows.map((r) => [r._id, r.count]));
  const dailyTarget = dailyMissions.reduce((sum, m) => sum + m.targetCompletions, 0);
  const completionChart = Array.from({ length: 7 }, (_, i) => {
    const key = dayKey(new Date(chartStart.getTime() + i * DAY_MS));
    return {
      date: key,
      name: new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      completed: completions.get(key) ?? 0,
      target: dailyTarget,
    };
  });

  const today = dayKey();
  const jobHolders = smms.filter((s) => s.jobHolderUnlocked).length;
  const qualityScore = smms.length
    ? Math.round(smms.reduce((sum, s) => sum + s.qualityScore, 0) / smms.length)
    : null;
  const baseSalaryTotal = jobHolders * brand.settings.weeklyBaseSalary;
  const rewardsThisWeek = weekRewardsRow?.total ?? 0;

  return {
    stats: {
      totalProducts,
      assignedSmms: smms.length,
      managedIds,
      activeIds: accountsByStatus.Eligible ?? 0,
      accountsByStatus,
      pendingEnrichment,
      pendingMissionReviews,
      pendingRapidReviews,
      pendingReviews: pendingEnrichment + pendingMissionReviews + pendingRapidReviews,
      qualityScore,
      jobHolders,
    },
    completionChart,
    needsAttention: {
      pendingEnrichment,
      inactiveSmms: smms
        .filter((s) => s.lastActiveDay !== today)
        .map((s) => ({ id: String(s._id), name: s.user?.name })),
    },
    payrollEstimate: {
      weeklyBaseSalary: brand.settings.weeklyBaseSalary,
      jobHolders,
      baseSalaryTotal,
      rewardsThisWeek,
      total: baseSalaryTotal + rewardsThisWeek,
    },
  };
}
