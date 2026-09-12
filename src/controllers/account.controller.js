import mongoose from '../lib/mongoose.js';
import { ACCOUNT_STATUSES, MANAGEMENT_ROLES, PLATFORMS } from '../constants.js';
import { Brand, Mission, SocialAccount, Submission } from '../models/index.js';
import {
  buildStagesFromBrand,
  refreshAccountState,
  reviewStage as reviewStageService,
  submitStage as submitStageService,
} from '../services/enrichment.service.js';
import { syncSmmStats } from '../services/progression.service.js';
import { assertBrandAccess, brandFilter } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { dayKey } from '../utils/dates.js';
import { escapeRegex, getPagination, paged, queryEnum } from '../utils/http.js';

const SMM_POPULATE = { path: 'smm', select: 'user', populate: { path: 'user', select: 'name avatar' } };

/** Loads an account the caller may access. SMMs: own accounts only. Staff: their brand. */
async function loadAccount(req, { ownerOnly = false, select } = {}) {
  const query = SocialAccount.findById(req.params.id);
  if (select) query.select(select);
  const account = await query;
  if (!account) throw ApiError.notFound('Account not found');

  if (req.smm) {
    if (!account.smm.equals(req.smm._id)) throw ApiError.forbidden('This account belongs to another SMM');
  } else {
    if (ownerOnly) throw ApiError.forbidden('Only the owning SMM can perform this action');
    assertBrandAccess(req, account.brand);
  }
  return account;
}

/** Adds today's mission completion counters used by the Hub cards. */
async function withTodayTasks(accounts) {
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a._id);
  const brandIds = [...new Set(accounts.map((a) => String(a.brand)))].map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  const [doneRows, missionRows] = await Promise.all([
    Submission.aggregate([
      {
        $match: {
          accounts: { $in: ids },
          isRapid: false,
          periodKey: dayKey(),
          status: { $in: ['Submitted', 'Completed'] },
        },
      },
      { $unwind: '$accounts' },
      { $match: { accounts: { $in: ids } } },
      { $group: { _id: '$accounts', count: { $sum: 1 } } },
    ]),
    Mission.aggregate([
      { $match: { brand: { $in: brandIds }, isRapid: false, status: 'Active', recurrence: 'Daily' } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
    ]),
  ]);

  const done = new Map(doneRows.map((r) => [String(r._id), r.count]));
  const dailyMissions = new Map(missionRows.map((r) => [String(r._id), r.count]));

  return accounts.map((a) => {
    const completed = done.get(String(a._id)) ?? 0;
    const total = a.status === 'Eligible' ? (dailyMissions.get(String(a.brand)) ?? 0) : 0;
    return {
      ...a.toJSON(),
      todayTasksCompleted: completed,
      todayTasksTotal: total,
      todayCompletionPercent: total ? Math.min(100, Math.round((completed / total) * 100)) : 0,
    };
  });
}

const credentialsView = (c = {}) => ({
  hasPassword: Boolean(c.hasPassword),
  twoFactorEnabled: Boolean(c.twoFactorEnabled),
  twoFactorMethod: c.twoFactorMethod,
  updatedAt: c.updatedAt,
});

export async function list(req, res) {
  const filter = {};
  if (req.smm) {
    filter.smm = req.smm._id;
  } else {
    Object.assign(filter, brandFilter(req));
    if (req.query.smm) {
      if (!mongoose.isValidObjectId(String(req.query.smm))) throw ApiError.badRequest('Invalid smm id');
      filter.smm = new mongoose.Types.ObjectId(String(req.query.smm));
    }
  }
  const status = queryEnum(req.query.status, ACCOUNT_STATUSES, 'status');
  if (status) filter.status = status;
  const platform = queryEnum(req.query.platform, PLATFORMS, 'platform');
  if (platform) filter.platform = platform;
  if (req.query.q) {
    const rx = { $regex: escapeRegex(req.query.q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }, { 'persona.fullName': rx }, { 'persona.username': rx }];
  }

  const pagination = getPagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const query = SocialAccount.find(filter)
    .sort({ smm: 1, serial: 1 })
    .skip(pagination.skip)
    .limit(pagination.limit);
  // ?view=summary drops the heavy arrays for list screens.
  if (req.query.view === 'summary') query.select('-history -notes -contentEntries');
  if (!req.smm) query.populate(SMM_POPULATE);

  const [accounts, total] = await Promise.all([query, SocialAccount.countDocuments(filter)]);
  res.json(paged(await withTodayTasks(accounts), total, pagination));
}

/** "Add New ID" wizard. Stages are snapshotted from the brand's enrichment config. */
export async function create(req, res) {
  const smm = req.smm;
  const brand = await Brand.findById(smm.brand);
  const stages = buildStagesFromBrand(brand);
  if (!stages.length) throw ApiError.badRequest('This brand has no active enrichment stages configured');

  const { password, twoFactorEnabled, twoFactorMethod, ...fields } = req.body;
  const credentials = {
    hasPassword: Boolean(password),
    twoFactorEnabled: Boolean(twoFactorEnabled),
    twoFactorMethod,
    ...(password && { passwordEnc: encrypt(password), updatedAt: new Date() }),
  };

  // Serial is "max + 1"; retry if two IDs are added at the same moment.
  for (let attempt = 0; ; attempt += 1) {
    const last = await SocialAccount.findOne({ smm: smm._id }).sort({ serial: -1 }).select('serial').lean();
    try {
      const account = await SocialAccount.create({
        ...fields,
        smm: smm._id,
        brand: brand._id,
        serial: (last?.serial ?? 0) + 1,
        status: 'Enrichment Started',
        stages,
        credentials,
      });
      await syncSmmStats(smm._id);
      return res.status(201).json(account);
    } catch (err) {
      if (err?.code === 11000 && err.keyPattern?.serial && attempt < 2) continue;
      throw err;
    }
  }
}

export async function get(req, res) {
  const account = await loadAccount(req);
  if (!req.smm) await account.populate(SMM_POPULATE);
  res.json(account);
}

export async function update(req, res) {
  const account = await loadAccount(req);
  const { status, ...fields } = req.body;

  if (req.smm) {
    if (status !== undefined) throw ApiError.forbidden('Only brand managers can lock or unlock accounts');
  } else if (!MANAGEMENT_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden();
  }

  account.set(fields);
  if (status === 'Locked') {
    account.status = 'Locked';
  } else if (status === 'Unlocked' && account.status === 'Locked') {
    account.status = 'Enrichment Started';
    refreshAccountState(account);
  }
  await account.save();
  if (status) await syncSmmStats(account.smm);
  res.json(account);
}

export async function remove(req, res) {
  const account = await loadAccount(req);
  await account.deleteOne();
  await syncSmmStats(account.smm);
  res.status(204).end();
}

// ---- Persona / notes / content -------------------------------------------------------

export async function updatePersona(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  account.persona = { ...(account.persona?.toObject() ?? {}), ...req.body };
  account.lastActivityAt = new Date();
  await account.save();
  res.json(account.persona);
}

export async function addNote(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  account.notes.push(req.body);
  await account.save();
  res.status(201).json(account.notes.at(-1));
}

export async function updateNote(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  const note = account.notes.id(req.params.noteId);
  if (!note) throw ApiError.notFound('Note not found');
  note.set(req.body);
  await account.save();
  res.json(note);
}

export async function deleteNote(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  if (!account.notes.id(req.params.noteId)) throw ApiError.notFound('Note not found');
  account.notes.pull(req.params.noteId);
  await account.save();
  res.status(204).end();
}

export async function addContent(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  account.contentEntries.push(req.body);
  account.lastActivityAt = new Date();
  await account.save();
  res.status(201).json(account.contentEntries.at(-1));
}

export async function deleteContent(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  if (!account.contentEntries.id(req.params.entryId)) throw ApiError.notFound('Content entry not found');
  account.contentEntries.pull(req.params.entryId);
  await account.save();
  res.status(204).end();
}

// ---- Credentials vault ---------------------------------------------------------------

export async function setCredentials(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  const { password, twoFactorEnabled, twoFactorMethod } = req.body;
  if (password !== undefined) {
    account.credentials.passwordEnc = encrypt(password);
    account.credentials.hasPassword = true;
  }
  if (twoFactorEnabled !== undefined) account.credentials.twoFactorEnabled = twoFactorEnabled;
  if (twoFactorMethod !== undefined) account.credentials.twoFactorMethod = twoFactorMethod;
  account.credentials.updatedAt = new Date();
  await account.save();
  res.json(credentialsView(account.credentials));
}

export async function revealCredentials(req, res) {
  if (!req.smm && !MANAGEMENT_ROLES.includes(req.user.role)) throw ApiError.forbidden();
  const account = await loadAccount(req, { select: '+credentials.passwordEnc' });
  if (!account.credentials?.passwordEnc) throw ApiError.notFound('No password stored for this account');

  let password;
  try {
    password = decrypt(account.credentials.passwordEnc);
  } catch {
    throw new ApiError(500, 'Stored credentials could not be decrypted (was the encryption key changed?)');
  }
  res.set('Cache-Control', 'no-store');
  res.json({ password });
}

// ---- Enrichment pipeline -------------------------------------------------------------

export async function submitStage(req, res) {
  const account = await loadAccount(req, { ownerOnly: true });
  res.json(
    await submitStageService({ account, stageId: req.params.stageId, proof: req.body, actor: req.user }),
  );
}

export async function reviewStage(req, res) {
  const account = await loadAccount(req);
  res.json(
    await reviewStageService({
      account,
      stageId: req.params.stageId,
      action: req.body.action,
      note: req.body.note,
      reviewer: req.user,
    }),
  );
}
