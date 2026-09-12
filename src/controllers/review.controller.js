import { Brand, SocialAccount, Submission } from '../models/index.js';
import { approvedWeight } from '../services/enrichment.service.js';
import { brandFilter } from '../utils/access.js';
import { getPagination, paged, queryEnum } from '../utils/http.js';

const SMM_POPULATE = { path: 'smm', select: 'user level qualityScore', populate: { path: 'user', select: 'name avatar' } };

/** Pending counts for the Review Center category cards. */
export async function summary(req, res) {
  const scope = brandFilter(req);
  const [[enrichment], submissions] = await Promise.all([
    SocialAccount.aggregate([
      { $match: { ...scope, 'stages.status': 'Under Review' } },
      { $unwind: '$stages' },
      { $match: { 'stages.status': 'Under Review' } },
      { $count: 'count' },
    ]),
    Submission.aggregate([
      { $match: { ...scope, status: 'Submitted' } },
      { $group: { _id: '$isRapid', count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    enrichment: enrichment?.count ?? 0,
    missions: submissions.find((r) => !r._id)?.count ?? 0,
    rapidTasks: submissions.find((r) => r._id)?.count ?? 0,
  });
}

/** Every stage currently under review, oldest submission first. */
export async function enrichmentQueue(req, res) {
  const accounts = await SocialAccount.find({ ...brandFilter(req), 'stages.status': 'Under Review' })
    .select('-history')
    .populate(SMM_POPULATE);

  const brandIds = [...new Set(accounts.map((a) => String(a.brand)))];
  const brands = await Brand.find({ _id: { $in: brandIds } }).select('settings.fullEnrichmentReward');
  const rewardByBrand = new Map(brands.map((b) => [String(b._id), b.settings.fullEnrichmentReward]));

  const items = [];
  for (const account of accounts) {
    const current = approvedWeight(account.stages);
    for (const stage of account.stages.filter((s) => s.status === 'Under Review')) {
      const afterApproval = Math.min(100, current + stage.weight);
      const completesEnrichment = afterApproval >= 100 && !account.fullEnrichmentRewardGranted;
      items.push({
        account: {
          id: String(account._id),
          code: account.code,
          serial: account.serial,
          name: account.name,
          platform: account.platform,
          email: account.email,
          status: account.status,
          enrichmentPercent: account.enrichmentPercent,
          persona: account.persona?.toJSON() ?? null,
          notesCount: account.notes.length,
          contentCount: account.contentEntries.length,
        },
        smm: { id: String(account.smm._id), name: account.smm.user?.name, avatar: account.smm.user?.avatar },
        stage: stage.toJSON(),
        currentEnrichment: current,
        afterApproval,
        xpReward: stage.xpReward,
        completesEnrichment,
        cashReward: completesEnrichment ? (rewardByBrand.get(String(account.brand)) ?? 0) : 0,
        submittedAt: stage.submission?.date ?? null,
      });
    }
  }
  items.sort((a, b) => new Date(a.submittedAt ?? 0) - new Date(b.submittedAt ?? 0));
  res.json(items);
}

/** Mission / rapid task submissions awaiting review (or any other status via ?status=). */
export async function submissionQueue(req, res) {
  const type = queryEnum(req.query.type, ['mission', 'rapid'], 'type') ?? 'mission';
  const status =
    queryEnum(req.query.status, ['In Progress', 'Submitted', 'Revision Required', 'Completed', 'Rejected'], 'status') ??
    'Submitted';
  const filter = { ...brandFilter(req), isRapid: type === 'rapid', status };

  const pagination = getPagination(req.query, { defaultLimit: 50 });
  const [items, total] = await Promise.all([
    Submission.find(filter)
      .populate('mission', 'title type reward xpReward recurrence isRapid deadline')
      .populate(SMM_POPULATE)
      .populate('accounts', 'name platform serial persona.fullName persona.avatar persona.username')
      .sort({ submittedAt: 1, createdAt: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    Submission.countDocuments(filter),
  ]);
  res.json(paged(items, total, pagination));
}
