import { MISSION_STATUSES } from '../constants.js';
import { Brand, Mission, Product, Smm, Submission } from '../models/index.js';
import { missionProgress, startExecution } from '../services/mission.service.js';
import { notifyMany } from '../services/notification.service.js';
import { assertJobHolder } from '../services/progression.service.js';
import { assertBrandAccess, brandFilter, brandForWrite, sameId } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { periodKeyFor } from '../utils/dates.js';
import { queryEnum } from '../utils/http.js';

const HOUR_MS = 3_600_000;
const RAPID_DEFAULTS = { reward: 50, xpReward: 50, targetCompletions: 20 };

async function resolveRefs(brandId, { productId, assignedSmmIds }) {
  const refs = {};
  if (productId !== undefined) {
    if (productId === null) {
      refs.product = null;
    } else {
      const product = await Product.exists({ _id: productId, brand: brandId });
      if (!product) throw ApiError.badRequest('Product not found for this brand');
      refs.product = productId;
    }
  }
  if (assignedSmmIds !== undefined) {
    const unique = [...new Set(assignedSmmIds)];
    const count = await Smm.countDocuments({ _id: { $in: unique }, brand: brandId });
    if (count !== unique.length) throw ApiError.badRequest('One or more SMMs do not belong to this brand');
    refs.assignedSmms = unique;
  }
  return refs;
}

function assertAssignment({ assignTo, assignedSmms, minLevel }) {
  if (assignTo === 'Specific SMMs' && !assignedSmms?.length) {
    throw ApiError.badRequest('Pick at least one SMM when assigning to specific SMMs');
  }
  if (assignTo === 'Tier' && !minLevel) {
    throw ApiError.badRequest('minLevel is required when targeting by tier');
  }
}

/** Notifies the job-holder SMMs a new mission / rapid task is aimed at. */
async function announce(mission) {
  const filter = { brand: mission.brand, status: 'Active', jobHolderUnlocked: true };
  if (mission.assignTo === 'Specific SMMs') filter._id = { $in: mission.assignedSmms };
  if (mission.assignTo === 'Tier') filter.level = { $gte: mission.minLevel };
  const smms = await Smm.find(filter).select('user');

  const [title, message, link] = mission.isRapid
    ? ['New Rapid Task ⚡', `${mission.title}: ৳${mission.reward} bounty, ${mission.timeLeft}.`, '/smm/rapid-tasks']
    : ['New Mission', `${mission.title}: ৳${mission.reward} + ${mission.xpReward} XP per completion.`, '/smm/missions'];
  await notifyMany(smms.map((s) => s.user), title, message, mission.isRapid ? 'warning' : 'info', link);
}

async function withProgress(missions) {
  const progress = await missionProgress(missions);
  return missions.map((m) => ({ ...m.toJSON(), progress: progress.get(String(m._id)) }));
}

/** Missions visible to an SMM right now, with their own executions for the current period. */
async function listForSmm(smm, isRapid) {
  assertJobHolder(smm);
  const now = new Date();
  const missions = await Mission.find({
    brand: smm.brand,
    isRapid,
    status: 'Active',
    startsAt: { $lte: now },
    $and: [
      { $or: [{ deadline: null }, { deadline: { $gt: now } }] },
      {
        $or: [
          { assignTo: 'All Eligible SMMs' },
          { assignTo: 'Specific SMMs', assignedSmms: smm._id },
          { assignTo: 'Tier', minLevel: { $lte: smm.level } },
        ],
      },
    ],
  })
    .populate('product', 'name')
    .sort({ deadline: 1, createdAt: -1 });

  const [progress, mine] = await Promise.all([
    missionProgress(missions),
    Submission.find({
      smm: smm._id,
      mission: { $in: missions.map((m) => m._id) },
      status: { $ne: 'Rejected' },
    }).select('mission periodKey status accounts'),
  ]);

  return missions.map((m) => {
    const periodKey = periodKeyFor(m.recurrence);
    const p = progress.get(String(m._id));
    return {
      ...m.toJSON(),
      progress: p,
      slotsLeft: Math.max(0, p.total - p.taken),
      mySubmissions: mine
        .filter((s) => sameId(s.mission, m._id) && s.periodKey === periodKey)
        .map((s) => ({ id: String(s._id), status: s.status, accounts: s.accounts.map(String) })),
    };
  });
}

/** Regular missions and rapid tasks share this controller; `isRapid` picks the flavour. */
export function missionController(isRapid) {
  const label = isRapid ? 'Rapid task' : 'Mission';

  async function load(req) {
    const mission = await Mission.findOne({ _id: req.params.id, isRapid }).populate('product', 'name');
    if (!mission) throw ApiError.notFound(`${label} not found`);
    assertBrandAccess(req, mission.brand);
    return mission;
  }

  return {
    async list(req, res) {
      if (req.smm) return res.json(await listForSmm(req.smm, isRapid));

      const filter = { ...brandFilter(req), isRapid };
      const status = queryEnum(req.query.status, MISSION_STATUSES, 'status');
      filter.status = status ?? { $ne: 'Archived' };
      const missions = await Mission.find(filter).populate('product', 'name').sort({ createdAt: -1 });
      res.json(await withProgress(missions));
    },

    async get(req, res) {
      const [mission] = await withProgress([await load(req)]);
      res.json(mission);
    },

    async create(req, res) {
      const { brandId, productId, assignedSmmIds, timeLimitHours, ...fields } = req.body;
      const brand = brandForWrite(req, brandId);
      if (!(await Brand.exists({ _id: brand }))) throw ApiError.notFound('Brand not found');

      const refs = await resolveRefs(brand, { productId, assignedSmmIds });
      assertAssignment({ ...fields, ...refs });

      const doc = {
        ...(isRapid ? RAPID_DEFAULTS : {}),
        ...fields,
        ...refs,
        brand,
        isRapid,
        createdBy: req.user._id,
      };
      if (isRapid) {
        const hours = timeLimitHours ?? 2;
        Object.assign(doc, {
          recurrence: 'One-time',
          timeLimitHours: hours,
          deadline: new Date(Date.now() + hours * HOUR_MS),
        });
      }

      const mission = await Mission.create(doc);
      await mission.populate('product', 'name');
      await announce(mission);
      const [json] = await withProgress([mission]);
      res.status(201).json(json);
    },

    async update(req, res) {
      const mission = await load(req);
      const { productId, assignedSmmIds, timeLimitHours, ...fields } = req.body;
      const refs = await resolveRefs(mission.brand, { productId, assignedSmmIds });

      mission.set({ ...fields, ...refs });
      if (isRapid && timeLimitHours) {
        // Changing the time limit restarts the countdown from now.
        mission.timeLimitHours = timeLimitHours;
        mission.deadline = new Date(Date.now() + timeLimitHours * HOUR_MS);
      }
      assertAssignment(mission);
      await mission.save();
      await mission.populate('product', 'name');
      const [json] = await withProgress([mission]);
      res.json(json);
    },

    async archive(req, res) {
      const mission = await load(req);
      mission.status = 'Archived';
      await mission.save();
      res.status(204).end();
    },

    /** SMM starts a mission with one ID, or accepts a rapid task with several. */
    async start(req, res) {
      const mission = await load(req);
      const submission = await startExecution({ mission, smm: req.smm, accountIds: req.body.accountIds });
      res.status(201).json(submission);
    },
  };
}
