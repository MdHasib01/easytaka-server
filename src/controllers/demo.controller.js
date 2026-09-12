import { Brand, Smm, SocialAccount } from '../models/index.js';
import { runSeed } from '../seed/seed.js';
import { refreshAccountState } from '../services/enrichment.service.js';
import { addXp, syncSmmStats } from '../services/progression.service.js';
import { assertBrandAccess } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';

// Backs the client's "Demo Controls" panel. Only mounted when DEMO_MODE is on.

async function targetSmm(req) {
  if (req.smm) return req.smm;
  if (!req.body.smmId) throw ApiError.badRequest('smmId is required');
  const smm = await Smm.findById(req.body.smmId);
  if (!smm) throw ApiError.notFound('SMM not found');
  assertBrandAccess(req, smm.brand);
  return smm;
}

/** Wipes the database and reloads the seed data. Everyone must log in again afterwards. */
export async function reset(_req, res) {
  res.json(await runSeed({ log: () => {} }));
}

/** Forces the first N IDs to fully approved and resets the rest to a fresh pipeline. */
export async function setApprovedIds(req, res) {
  const smm = await targetSmm(req);
  const { count } = req.body;
  const accounts = await SocialAccount.find({ smm: smm._id }).sort({ serial: 1 });

  for (const [i, account] of accounts.entries()) {
    if (i < count) {
      account.stages.forEach((s) => {
        s.status = 'Approved';
        s.checklist.forEach((c) => {
          c.checked = true;
        });
      });
      account.fullEnrichmentRewardGranted = true; // no payouts for demo shortcuts
    } else {
      account.stages.forEach((s, idx) => {
        s.status = idx === 0 ? 'Available' : 'Locked';
        s.submission = undefined;
        s.checklist.forEach((c) => {
          c.checked = false;
        });
      });
      account.status = 'New';
    }
    refreshAccountState(account);
    await account.save();
  }

  const brand = await Brand.findById(smm.brand).select('settings');
  if (count < brand.settings.jobHolderThreshold) {
    // Lets the demo replay the Job Holder celebration. Cash is still paid at most once.
    await Smm.updateOne({ _id: smm._id }, { $set: { jobHolderUnlocked: false, jobHolderBonusClaimed: false } });
  }
  res.json(await syncSmmStats(smm._id));
}

export async function grantXp(req, res) {
  const smm = await targetSmm(req);
  const updated = await addXp(smm._id, req.body.amount);
  res.json({ level: updated.level, lifetimeXp: updated.lifetimeXp, redeemableXp: updated.redeemableXp });
}
