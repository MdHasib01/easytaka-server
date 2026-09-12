import mongoose from '../lib/mongoose.js';
import { MANAGEMENT_ROLES, TRANSACTION_CATEGORIES } from '../constants.js';
import { Brand, Transaction } from '../models/index.js';
import { processWithdrawal as processWithdrawalService, requestWithdrawal, weeklyEarnings } from '../services/wallet.service.js';
import { assertBrandAccess, brandFilter } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, paged, queryEnum } from '../utils/http.js';

const SMM_POPULATE = { path: 'smm', select: 'user', populate: { path: 'user', select: 'name' } };

export async function summary(req, res) {
  const smm = req.smm;
  const [weekly, [pending], transactions] = await Promise.all([
    weeklyEarnings(smm._id),
    Transaction.aggregate([
      { $match: { smm: smm._id, category: 'withdrawal', status: 'Pending' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Transaction.find({ smm: smm._id }).sort({ createdAt: -1 }).limit(10),
  ]);
  res.json({
    balance: smm.walletBalance,
    weeklyEarnings: weekly,
    pendingWithdrawals: { total: pending?.total ?? 0, count: pending?.count ?? 0 },
    transactions,
  });
}

export async function transactions(req, res) {
  const filter = {};
  if (req.smm) {
    filter.smm = req.smm._id;
  } else {
    if (!MANAGEMENT_ROLES.includes(req.user.role)) throw ApiError.forbidden();
    Object.assign(filter, brandFilter(req));
    if (req.query.smm) {
      if (!mongoose.isValidObjectId(String(req.query.smm))) throw ApiError.badRequest('Invalid smm id');
      filter.smm = String(req.query.smm);
    }
  }
  const type = queryEnum(req.query.type, ['credit', 'debit'], 'type');
  if (type) filter.type = type;
  const category = queryEnum(req.query.category, TRANSACTION_CATEGORIES, 'category');
  if (category) filter.category = category;
  const status = queryEnum(req.query.status, ['Completed', 'Pending', 'Rejected'], 'status');
  if (status) filter.status = status;

  const pagination = getPagination(req.query, { defaultLimit: 20 });
  const query = Transaction.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit);
  if (!req.smm) query.populate(SMM_POPULATE);
  const [items, total] = await Promise.all([query, Transaction.countDocuments(filter)]);
  res.json(paged(items, total, pagination));
}

export async function withdraw(req, res) {
  const brand = await Brand.findById(req.smm.brand).select('settings');
  const tx = await requestWithdrawal(req.smm, req.body, brand?.settings?.minWithdrawal ?? 0);
  res.status(201).json(tx);
}

export async function listWithdrawals(req, res) {
  const filter = { ...brandFilter(req), category: 'withdrawal' };
  const status = queryEnum(req.query.status, ['Completed', 'Pending', 'Rejected'], 'status') ?? 'Pending';
  filter.status = status;

  const pagination = getPagination(req.query, { defaultLimit: 50 });
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .populate(SMM_POPULATE)
      .sort({ createdAt: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    Transaction.countDocuments(filter),
  ]);
  res.json(paged(items, total, pagination));
}

export async function processWithdrawal(req, res) {
  const tx = await Transaction.findById(req.params.id);
  if (!tx || tx.category !== 'withdrawal') throw ApiError.notFound('Withdrawal not found');
  assertBrandAccess(req, tx.brand);
  res.json(await processWithdrawalService(tx._id, req.body.action, req.user, req.body.note));
}
