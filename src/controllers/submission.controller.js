import { SUBMISSION_STATUSES } from '../constants.js';
import { Submission } from '../models/index.js';
import { reviewExecution, submitExecution } from '../services/mission.service.js';
import { assertBrandAccess } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, paged, queryEnum } from '../utils/http.js';

const MISSION_FIELDS = 'title type reward xpReward recurrence deadline isRapid instructions link';
const ACCOUNT_FIELDS = 'name platform serial persona.fullName persona.username persona.avatar';

async function loadSubmission(req) {
  const submission = await Submission.findById(req.params.id);
  if (!submission) throw ApiError.notFound('Submission not found');
  if (req.smm) {
    if (!submission.smm.equals(req.smm._id)) throw ApiError.forbidden('This submission belongs to another SMM');
  } else {
    assertBrandAccess(req, submission.brand);
  }
  return submission;
}

/** The SMM's own executions, filterable by status and type (mission | rapid). */
export async function mine(req, res) {
  const filter = { smm: req.smm._id };
  const status = queryEnum(req.query.status, SUBMISSION_STATUSES, 'status');
  if (status) filter.status = status;
  const type = queryEnum(req.query.type, ['mission', 'rapid'], 'type');
  if (type) filter.isRapid = type === 'rapid';

  const pagination = getPagination(req.query, { defaultLimit: 50 });
  const [items, total] = await Promise.all([
    Submission.find(filter)
      .populate('mission', MISSION_FIELDS)
      .populate('accounts', ACCOUNT_FIELDS)
      .sort({ updatedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    Submission.countDocuments(filter),
  ]);
  res.json(paged(items, total, pagination));
}

export async function get(req, res) {
  const submission = await loadSubmission(req);
  await submission.populate([
    { path: 'mission', select: MISSION_FIELDS },
    { path: 'accounts', select: ACCOUNT_FIELDS },
    { path: 'reviewedBy', select: 'name role' },
  ]);
  res.json(submission);
}

export async function submit(req, res) {
  const submission = await loadSubmission(req);
  res.json(await submitExecution({ submission, proof: req.body }));
}

export async function review(req, res) {
  const submission = await loadSubmission(req);
  res.json(
    await reviewExecution({
      submission,
      action: req.body.action,
      note: req.body.note,
      reviewer: req.user,
    }),
  );
}
