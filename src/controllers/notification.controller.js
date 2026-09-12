import { Notification } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, paged } from '../utils/http.js';

export async function list(req, res) {
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.read = false;

  const pagination = getPagination(req.query, { defaultLimit: 20 });
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ ...paged(items, total, pagination), unreadCount });
}

export async function markRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { read: true } },
    { returnDocument: 'after' },
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  res.json(notification);
}

export async function markAllRead(req, res) {
  const result = await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.json({ updated: result.modifiedCount });
}

export async function remove(req, res) {
  const result = await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!result.deletedCount) throw ApiError.notFound('Notification not found');
  res.status(204).end();
}
