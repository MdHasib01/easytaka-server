import { Redemption, RewardItem, Smm } from '../models/index.js';
import { notify } from '../services/notification.service.js';
import { brandFilter, isPlatformAdmin, sameId } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, paged, queryEnum } from '../utils/http.js';

const hasStockLimit = (item) => item.stock !== null && item.stock !== undefined;

async function loadItem(req) {
  const item = await RewardItem.findById(req.params.id);
  if (!item) throw ApiError.notFound('Reward not found');
  // Brand managers may only edit their own brand's items; global items are platform-admin only.
  if (!isPlatformAdmin(req.user) && !sameId(item.brand, req.user.brand)) {
    throw ApiError.forbidden('You cannot edit this reward');
  }
  return item;
}

/** Reward store. Items are global (brand = null) or brand-specific. */
export async function list(req, res) {
  const brandId = req.user.brand;
  const filter = { $or: [{ brand: null }, ...(brandId ? [{ brand: brandId }] : [])] };
  if (req.smm || req.query.all !== 'true') filter.active = true;

  const items = await RewardItem.find(filter).sort({ cost: 1 });
  const xp = req.smm?.redeemableXp;
  res.json({
    redeemableXp: xp ?? null,
    items: items.map((item) => ({
      ...item.toJSON(),
      ...(xp !== undefined && {
        canAfford: xp >= item.cost && (!hasStockLimit(item) || item.stock > 0),
      }),
    })),
  });
}

export async function create(req, res) {
  const { brandId, ...fields } = req.body;
  const brand = isPlatformAdmin(req.user) ? (brandId ?? null) : req.user.brand;
  const item = await RewardItem.create({ ...fields, brand });
  res.status(201).json(item);
}

export async function update(req, res) {
  const item = await loadItem(req);
  item.set(req.body);
  await item.save();
  res.json(item);
}

export async function redeem(req, res) {
  const item = await RewardItem.findOne({ _id: req.params.id, active: true });
  if (!item || (item.brand && !sameId(item.brand, req.smm.brand))) {
    throw ApiError.notFound('Reward not found');
  }

  const smm = await Smm.findOneAndUpdate(
    { _id: req.smm._id, redeemableXp: { $gte: item.cost } },
    { $inc: { redeemableXp: -item.cost } },
    { returnDocument: 'after' },
  );
  if (!smm) throw ApiError.badRequest(`Not enough redeemable XP (this reward costs ${item.cost} XP)`);

  if (hasStockLimit(item)) {
    const reserved = await RewardItem.findOneAndUpdate(
      { _id: item._id, stock: { $gt: 0 } },
      { $inc: { stock: -1 } },
    );
    if (!reserved) {
      await Smm.updateOne({ _id: smm._id }, { $inc: { redeemableXp: item.cost } });
      throw ApiError.conflict('This reward is out of stock');
    }
  }

  const redemption = await Redemption.create({
    smm: smm._id,
    brand: smm.brand,
    item: item._id,
    title: item.title,
    cost: item.cost,
  });
  await notify(req.user._id, 'Reward Redeemed', `${item.title} redeemed for ${item.cost} XP. It will be processed shortly.`, 'success');
  res.status(201).json({ redemption, redeemableXp: smm.redeemableXp });
}

export async function redemptions(req, res) {
  const filter = req.smm ? { smm: req.smm._id } : { ...brandFilter(req) };
  const status = queryEnum(req.query.status, ['Pending', 'Fulfilled', 'Cancelled'], 'status');
  if (status) filter.status = status;

  const pagination = getPagination(req.query, { defaultLimit: 20 });
  const query = Redemption.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit);
  if (!req.smm) query.populate({ path: 'smm', select: 'user', populate: { path: 'user', select: 'name' } });
  const [items, total] = await Promise.all([query, Redemption.countDocuments(filter)]);
  res.json(paged(items, total, pagination));
}

/** Fulfil or cancel a pending redemption. Cancelling refunds the XP and the stock. */
export async function processRedemption(req, res) {
  const existing = await Redemption.findById(req.params.id);
  if (!existing) throw ApiError.notFound('Redemption not found');
  if (!isPlatformAdmin(req.user) && !sameId(existing.brand, req.user.brand)) throw ApiError.forbidden();

  const redemption = await Redemption.findOneAndUpdate(
    { _id: existing._id, status: 'Pending' },
    { $set: { status: req.body.status, note: req.body.note, processedBy: req.user._id, processedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!redemption) throw ApiError.conflict('This redemption was already processed');

  const smm = await Smm.findById(redemption.smm).select('user');
  if (redemption.status === 'Cancelled') {
    await Smm.updateOne({ _id: redemption.smm }, { $inc: { redeemableXp: redemption.cost } });
    await RewardItem.updateOne({ _id: redemption.item, stock: { $ne: null } }, { $inc: { stock: 1 } });
    await notify(smm?.user, 'Redemption Cancelled', `${redemption.title} was cancelled and ${redemption.cost} XP refunded.`, 'warning');
  } else {
    await notify(smm?.user, 'Reward Delivered', `${redemption.title} has been fulfilled.`, 'success');
  }
  res.json(redemption);
}
