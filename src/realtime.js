// WebSocket hub for internal chat: pushes new messages/conversations, typing and presence.
// Clients connect to /api/ws and must send {type:'auth', token} first. All writes still go
// through the REST API (validated + permission-checked); the socket only fans out events.
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import { env } from './config/env.js';
import { ROLES } from './constants.js';
import { Conversation, Smm, User } from './models/index.js';
import { idOf } from './utils/access.js';

const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;

/** userId -> Set of authenticated sockets (one per open tab). */
const sockets = new Map();

export const isOnline = (userId) => sockets.has(idOf(userId));

/** Sends one event to every open socket of the given users. */
export function emitToUsers(userIds, payload) {
  const data = JSON.stringify(payload);
  for (const id of new Set(userIds.map(idOf))) {
    for (const ws of sockets.get(id) ?? []) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }
}

const send = (ws, payload) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(payload));

/** Everyone who shares at least one conversation with the user. */
async function peersOf(userId) {
  const ids = await Conversation.distinct('participants', { participants: userId });
  return ids.map(String).filter((id) => id !== String(userId));
}

async function authenticateSocket(token) {
  const payload = jwt.verify(String(token), env.JWT_SECRET);
  const user = await User.findById(payload.sub).select('name role status');
  if (!user || user.status !== 'Active') throw new Error('Inactive user');
  if (user.role === ROLES.SMM) {
    const smm = await Smm.findOne({ user: user._id }).select('verification');
    if (smm?.verification?.status !== 'Verified') throw new Error('SMM not verified');
  }
  return user;
}

async function onAuth(ws, token) {
  if (ws.authing) return;
  ws.authing = true;
  let user;
  try {
    user = await authenticateSocket(token);
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }
  // The client may have gone away while we were checking the token.
  if (ws.readyState !== ws.OPEN) return;
  clearTimeout(ws.authTimer);
  ws.userId = String(user._id);
  ws.userName = user.name;

  const firstSocket = !sockets.has(ws.userId);
  if (firstSocket) sockets.set(ws.userId, new Set());
  sockets.get(ws.userId).add(ws);

  const peers = await peersOf(ws.userId);
  send(ws, { type: 'ready', userId: ws.userId, online: peers.filter(isOnline) });
  if (firstSocket) emitToUsers(peers, { type: 'presence', userId: ws.userId, online: true });
}

async function onTyping(ws, conversationId) {
  if (!/^[a-f\d]{24}$/i.test(String(conversationId))) return;
  const conversation = await Conversation.findOne({ _id: conversationId, participants: ws.userId }).select(
    'participants',
  );
  if (!conversation) return;
  emitToUsers(
    conversation.participants.filter((p) => String(p) !== ws.userId),
    { type: 'typing', conversationId: String(conversation._id), userId: ws.userId, name: ws.userName },
  );
}

async function onPresenceQuery(ws, userIds) {
  if (!Array.isArray(userIds)) return;
  // Only reveal presence of people the caller already shares a conversation with.
  const peers = new Set(await peersOf(ws.userId));
  const asked = userIds.slice(0, 500).map(String).filter((id) => peers.has(id));
  send(ws, { type: 'presence:state', users: asked.map((id) => ({ userId: id, online: isOnline(id) })) });
}

async function onClose(ws) {
  clearTimeout(ws.authTimer);
  if (!ws.userId) return;
  const set = sockets.get(ws.userId);
  set?.delete(ws);
  if (set && set.size === 0) {
    sockets.delete(ws.userId);
    emitToUsers(await peersOf(ws.userId), { type: 'presence', userId: ws.userId, online: false });
  }
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/api/ws', maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.authTimer = setTimeout(() => ws.close(4001, 'Authentication timeout'), AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const task = !ws.userId
        ? msg?.type === 'auth' && onAuth(ws, msg.token)
        : msg?.type === 'typing'
          ? onTyping(ws, msg.conversationId)
          : msg?.type === 'presence:query'
            ? onPresenceQuery(ws, msg.userIds)
            : null;
      Promise.resolve(task).catch((err) => console.error('[realtime]', err.message));
    });

    ws.on('close', () => onClose(ws).catch((err) => console.error('[realtime]', err.message)));
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}
