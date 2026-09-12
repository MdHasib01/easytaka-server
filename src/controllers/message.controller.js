import { ROLES, STAFF_ROLES } from '../constants.js';
import { Conversation, Message, SocialAccount, User } from '../models/index.js';
import { isPlatformAdmin, sameId } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/http.js';

const PARTICIPANT_FIELDS = 'name role avatar brand';

/** SMMs talk to staff of their brand and platform admins; staff talk within their brand. */
function canContact(me, other) {
  if (sameId(me._id, other._id) || other.status !== 'Active') return false;
  if (isPlatformAdmin(me) || isPlatformAdmin(other)) return true;
  if (!sameId(me.brand, other.brand)) return false;
  return !(me.role === ROLES.SMM && other.role === ROLES.SMM);
}

function markRead(conversation, userId, at = new Date()) {
  const entry = conversation.reads.find((r) => sameId(r.user, userId));
  if (entry) entry.at = at;
  else conversation.reads.push({ user: userId, at });
}

async function loadConversation(req) {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation || !conversation.participants.some((p) => sameId(p, req.user._id))) {
    throw ApiError.notFound('Conversation not found');
  }
  return conversation;
}

async function postMessage(conversation, sender, content) {
  const message = await Message.create({ conversation: conversation._id, sender: sender._id, content });
  conversation.lastMessage = { content: content.slice(0, 200), sender: sender._id, at: message.createdAt };
  markRead(conversation, sender._id, message.createdAt);
  await conversation.save();
  await message.populate('sender', PARTICIPANT_FIELDS);
  return message;
}

export async function contacts(req, res) {
  const me = req.user;
  const filter = { _id: { $ne: me._id }, status: 'Active' };
  const platformAdmins = { role: ROLES.ADMIN, brand: null };
  if (me.role === ROLES.SMM) {
    filter.$or = [{ brand: me.brand, role: { $in: STAFF_ROLES } }, platformAdmins];
  } else if (!isPlatformAdmin(me)) {
    filter.$or = [{ brand: me.brand }, platformAdmins];
  }
  if (req.query.q) filter.name = { $regex: escapeRegex(req.query.q), $options: 'i' };

  res.json(await User.find(filter).select(PARTICIPANT_FIELDS).sort({ role: 1, name: 1 }).limit(100));
}

export async function list(req, res) {
  const me = req.user;
  const conversations = await Conversation.find({ participants: me._id })
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('relatedAccount', 'name serial')
    .sort({ updatedAt: -1 })
    .limit(100);

  const unread = await Promise.all(
    conversations.map((c) => {
      const read = c.reads.find((r) => sameId(r.user, me._id));
      return Message.countDocuments({
        conversation: c._id,
        sender: { $ne: me._id },
        ...(read?.at && { createdAt: { $gt: read.at } }),
      });
    }),
  );

  res.json(conversations.map((c, i) => ({ ...c.toJSON(), unreadCount: unread[i] })));
}

/** Starts (or reuses) a 1:1 conversation and posts the first message. */
export async function create(req, res) {
  const me = req.user;
  const { participantId, topic, message, relatedAccountId } = req.body;

  const other = await User.findById(participantId);
  if (!other || !canContact(me, other)) throw ApiError.forbidden('You cannot message this user');
  const brand = me.brand ?? other.brand ?? null;

  if (relatedAccountId) {
    const account = await SocialAccount.findById(relatedAccountId).select('brand smm');
    if (!account || (brand && !sameId(account.brand, brand))) {
      throw ApiError.badRequest('Related account not found in this brand');
    }
  }

  let conversation = await Conversation.findOne({
    participants: { $all: [me._id, other._id], $size: 2 },
    relatedAccount: relatedAccountId ?? null,
  });
  const created = !conversation;
  if (!conversation) {
    conversation = await Conversation.create({
      participants: [me._id, other._id],
      brand,
      topic,
      relatedAccount: relatedAccountId ?? null,
    });
  }

  const posted = await postMessage(conversation, me, message);
  await conversation.populate('participants', PARTICIPANT_FIELDS);
  res.status(created ? 201 : 200).json({ conversation, message: posted });
}

/** Messages, newest page first but returned in chronological order. Marks the thread read. */
export async function messages(req, res) {
  const conversation = await loadConversation(req);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const filter = { conversation: conversation._id };
  if (req.query.before) {
    const before = new Date(String(req.query.before));
    if (Number.isNaN(before.getTime())) throw ApiError.badRequest('Invalid "before" timestamp');
    filter.createdAt = { $lt: before };
  }

  const items = await Message.find(filter)
    .populate('sender', PARTICIPANT_FIELDS)
    .sort({ createdAt: -1 })
    .limit(limit);

  markRead(conversation, req.user._id);
  await conversation.save();
  res.json({ items: items.reverse(), hasMore: items.length === limit });
}

export async function send(req, res) {
  const conversation = await loadConversation(req);
  res.status(201).json(await postMessage(conversation, req.user, req.body.content));
}

export async function read(req, res) {
  const conversation = await loadConversation(req);
  markRead(conversation, req.user._id);
  await conversation.save();
  res.status(204).end();
}
