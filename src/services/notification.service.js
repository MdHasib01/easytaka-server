import { Notification } from '../models/index.js';

export async function notify(userId, title, message, type = 'info', link) {
  if (!userId) return null;
  return Notification.create({ user: userId, title, message, type, link });
}

export async function notifyMany(userIds, title, message, type = 'info', link) {
  const unique = [...new Set(userIds.filter(Boolean).map(String))];
  if (!unique.length) return [];
  return Notification.insertMany(unique.map((user) => ({ user, title, message, type, link })));
}
