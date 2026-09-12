import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import * as models from '../models/index.js';
import { buildStagesFromBrand, refreshAccountState } from '../services/enrichment.service.js';
import { levelForXp, syncSmmStats } from '../services/progression.service.js';
import { encrypt } from '../utils/crypto.js';
import { DAY_MS, dayKey, startOfWeek } from '../utils/dates.js';
import { contentEntries, firstAccountNotes, personas, products as productData, rewardItems } from './data.js';

const { Brand, Conversation, Message, Mission, Notification, Product, RewardItem, Smm, SocialAccount, Transaction, User } =
  models;

const HOUR_MS = 3_600_000;

function approve(stage, at, reviewerId) {
  stage.status = 'Approved';
  stage.checklist.forEach((c) => {
    c.checked = true;
  });
  stage.submission = {
    status: 'Approved',
    checklistConfirmed: true,
    date: at,
    reviewedBy: reviewerId,
    reviewedAt: new Date(at.getTime() + HOUR_MS),
  };
}

async function seedConversation(participants, brand, topic, messages, { relatedAccount, readAt = {} } = {}) {
  const conversation = await Conversation.create({ participants, brand, topic, relatedAccount });
  let last;
  for (const [sender, content, at] of messages) {
    last = await Message.create({ conversation: conversation._id, sender, content, createdAt: at, updatedAt: at });
  }
  conversation.lastMessage = { content: last.content, sender: last.sender, at: last.createdAt };
  conversation.reads = participants.map((user) => ({ user, at: readAt[String(user)] ?? last.createdAt }));
  await conversation.save();
  return conversation;
}

/** Wipes every collection and loads the demo data set. Expects an open connection. */
export async function runSeed({ log = console.info } = {}) {
  const now = Date.now();

  log('[seed] Clearing collections…');
  for (const model of Object.values(models)) {
    await model.deleteMany({});
    await model.createIndexes();
  }

  // ---- Brand, staff, products ------------------------------------------------------
  const brand = await Brand.create({
    name: 'Milkimom',
    logo: '🥛',
    industry: 'FMCG / Baby Care',
    primaryPlatform: 'Facebook',
    emailGuideline: 'firstname.milkimom.number@gmail.com',
  });

  const [admin, manager, reviewer] = await User.create([
    { name: 'Platform Admin', email: 'admin@easytaka.com', password: env.SEED_ADMIN_PASSWORD, role: 'ADMIN' },
    { name: 'Brand Manager', email: 'manager@milkimom.com', password: env.SEED_ADMIN_PASSWORD, role: 'MANAGER', brand: brand._id },
    { name: 'Operations Reviewer', email: 'reviewer@milkimom.com', password: env.SEED_ADMIN_PASSWORD, role: 'REVIEWER', brand: brand._id },
  ]);

  const products = await Product.create(productData.map((p) => ({ ...p, brand: brand._id })));

  // ---- SMM: Rafi Islam -------------------------------------------------------------
  const rafi = await User.create({
    name: 'Rafi Islam',
    email: 'rafi@easytaka.com',
    phone: '+8801700000000',
    password: env.SEED_SMM_PASSWORD,
    role: 'SMM',
    brand: brand._id,
  });
  const smm = await Smm.create({
    user: rafi._id,
    brand: brand._id,
    nidDivision: 'Khulna',
    assignedWorkingDivision: 'Dhaka',
    assignedProductIds: products.map((p) => p._id),
    lifetimeXp: 1280,
    redeemableXp: 640,
    level: levelForXp(1280),
    currentStreak: 18,
    lastActiveDay: dayKey(now - DAY_MS),
    reviewStats: { approved: 94, revision: 4, rejected: 2 },
    qualityScore: 94,
    walletBalance: 980,
  });

  // ---- 20 social IDs: 16 eligible, 1 under review, 1 revision, 1 started, 1 new ----------
  const template = buildStagesFromBrand(brand);
  const accounts = [];
  for (let i = 0; i < 20; i += 1) {
    const stages = structuredClone(template);
    const history = [];
    let status = 'Enrichment Started';
    const startedAt = new Date(now - (40 - i) * DAY_MS);

    if (i < 16) {
      stages.forEach((s, idx) => approve(s, new Date(startedAt.getTime() + idx * DAY_MS), reviewer._id));
      const final = stages.at(-1);
      history.push({
        date: new Date(startedAt.getTime() + stages.length * DAY_MS),
        stageId: final.id,
        stageName: final.name,
        status: 'Approved',
        reviewer: reviewer.name,
        reviewerId: reviewer._id,
        xpAwarded: final.xpReward,
        progressBefore: 100 - final.weight,
        progressAfter: 100,
      });
    } else if (i === 16) {
      approve(stages[0], startedAt, reviewer._id);
      const at = new Date(now - 2 * HOUR_MS);
      stages[1].status = 'Under Review';
      stages[1].checklist.forEach((c) => {
        c.checked = true;
      });
      stages[1].submission = {
        status: 'Submitted',
        checklistConfirmed: true,
        profileUrl: `https://facebook.com/rafi.milkimom.${i + 1}`,
        notes: 'Updated the profile and cover photo to match the persona.',
        date: at,
      };
      history.push({ date: at, stageId: stages[1].id, stageName: stages[1].name, status: 'Submitted', reviewer: rafi.name, reviewerId: rafi._id, progressBefore: 10, progressAfter: 10 });
    } else if (i === 17) {
      approve(stages[0], startedAt, reviewer._id);
      const at = new Date(now - 20 * HOUR_MS);
      const note = 'The cover photo looks like a stock image. Please upload an original photo.';
      stages[1].status = 'Revision Required';
      stages[1].submission = {
        status: 'Revision',
        checklistConfirmed: true,
        date: new Date(now - DAY_MS),
        reviewerNote: note,
        reviewedBy: reviewer._id,
        reviewedAt: at,
      };
      history.push({ date: at, stageId: stages[1].id, stageName: stages[1].name, status: 'Revision Required', reviewer: reviewer.name, reviewerId: reviewer._id, note, progressBefore: 10, progressAfter: 10 });
    } else if (i === 19) {
      status = 'New';
    }

    const account = new SocialAccount({
      smm: smm._id,
      brand: brand._id,
      serial: i + 1,
      name: `Rafi_${i + 1}`,
      platform: 'Facebook',
      email: `rafi.milkimom.${i + 1}@gmail.com`,
      profileUrl: `https://facebook.com/rafi.milkimom.${i + 1}`,
      status,
      stages,
      persona: personas[i],
      notes: i === 0 ? firstAccountNotes() : [],
      contentEntries: i < 16 ? contentEntries(i) : [],
      history,
      fullEnrichmentRewardGranted: i < 16,
      credentials: {
        passwordEnc: encrypt(`Demo@${1000 + i}`),
        hasPassword: true,
        twoFactorEnabled: i < 18,
        twoFactorMethod: i < 18 ? 'Authenticator App' : undefined,
        updatedAt: startedAt,
      },
      lastActivityAt: new Date(now - (i % 5) * HOUR_MS),
    });
    refreshAccountState(account);
    accounts.push(account);
  }
  await Promise.all(accounts.map((a) => a.save()));
  await syncSmmStats(smm._id);

  // ---- Missions & rapid tasks -------------------------------------------------------
  await Mission.create([
    {
      brand: brand._id,
      product: products[0]._id,
      title: 'Daily Timeline Post',
      type: 'Posting',
      recurrence: 'Daily',
      instructions: 'Publish one lifestyle post on the timeline that naturally mentions Milkimom. Follow the persona tone.',
      reward: 10,
      xpReward: 15,
      targetCompletions: 20,
      createdBy: manager._id,
    },
    {
      brand: brand._id,
      product: products[2]._id,
      title: 'Target Group Engagement',
      type: 'Engagement',
      recurrence: 'Daily',
      instructions: 'Please engage with the latest brand post on the main page. Like, and leave a substantive comment (min 5 words).',
      reward: 20,
      xpReward: 20,
      targetCompletions: 15,
      createdBy: manager._id,
    },
    {
      brand: brand._id,
      product: products[1]._id,
      title: 'Weekly Product Review',
      type: 'Review/Rating',
      recurrence: 'Weekly',
      instructions: 'Write an honest review of Milkimom Premium in a parenting group, using your persona voice.',
      reward: 40,
      xpReward: 50,
      targetCompletions: 10,
      createdBy: manager._id,
    },
    {
      brand: brand._id,
      isRapid: true,
      title: 'Flash Sale Boost - Milkimom Pump',
      type: 'Sharing',
      recurrence: 'One-time',
      urgency: 'Critical',
      timeLimitHours: 2,
      deadline: new Date(now + 2 * HOUR_MS),
      instructions: 'Brand is launching a new promo today. We need immediate positive engagement on the latest post using your approved enriched IDs.',
      reward: 50,
      xpReward: 50,
      targetCompletions: 20,
      requiredIds: 5,
      createdBy: manager._id,
    },
    {
      brand: brand._id,
      isRapid: true,
      title: 'Urgent Promo Launch Commenting',
      type: 'Engagement',
      recurrence: 'One-time',
      urgency: 'High',
      timeLimitHours: 6,
      deadline: new Date(now + 6 * HOUR_MS),
      instructions: 'Comment on the launch post with a genuine question about the new pack size.',
      reward: 25,
      xpReward: 25,
      targetCompletions: 10,
      requiredIds: 3,
      createdBy: manager._id,
    },
  ]);

  // ---- Wallet history (sums to the seeded ৳980 balance) --------------------------------
  const weekStart = startOfWeek().getTime();
  await Transaction.create([
    {
      smm: smm._id,
      brand: brand._id,
      type: 'credit',
      category: 'adjustment',
      title: 'Opening Balance',
      description: 'Carried forward',
      amount: 230,
      balanceAfter: 230,
      createdAt: new Date(weekStart - 3 * DAY_MS),
    },
    {
      smm: smm._id,
      brand: brand._id,
      type: 'credit',
      category: 'salary',
      title: 'Weekly Base Salary',
      description: 'Week 2 (20 IDs)',
      amount: 750,
      balanceAfter: 980,
      createdAt: new Date(Math.min(now, weekStart + 10 * HOUR_MS)),
    },
  ]);

  await RewardItem.create(rewardItems);

  // ---- Notifications & messages -----------------------------------------------------
  await Notification.create([
    { user: rafi._id, title: 'Welcome to EasyTaka', message: 'Complete 20 approved IDs to become a Job Holder.', type: 'info' },
    { user: rafi._id, title: 'Revision Required', message: 'Profile Identity Complete for Rafi_18 needs revision. Check the feedback.', type: 'warning' },
  ]);

  const minutesAgo = (m) => new Date(now - m * 60_000);
  await seedConversation(
    [rafi._id, manager._id],
    brand._id,
    'Campaign updates',
    [
      [manager._id, 'Please ensure you use the Nusrat Jahan persona for the latest rapid task. It requires a specific maternal tone.', minutesAgo(180)],
      [rafi._id, 'I have completed the targeted engagement using the specified tone. The note has been added to the persona history.', minutesAgo(177)],
      [manager._id, 'Great work on the recent campaign.', minutesAgo(2)],
    ],
    { readAt: { [String(rafi._id)]: minutesAgo(177) } },
  );
  await seedConversation(
    [rafi._id, reviewer._id],
    brand._id,
    'Rafi_18 revision',
    [[reviewer._id, 'Please revise the cover photo for ID 18.', minutesAgo(60)]],
    { relatedAccount: accounts[17]._id },
  );
  await seedConversation(
    [manager._id, admin._id],
    brand._id,
    'Payroll',
    [[admin._id, 'Your weekly workforce payroll is ready for review.', minutesAgo(24 * 60)]],
  );

  const logins = [
    { role: 'ADMIN', email: admin.email },
    { role: 'MANAGER', email: manager.email },
    { role: 'REVIEWER', email: reviewer.email },
    { role: 'SMM', email: rafi.email },
  ];
  log(`[seed] Done. Brand "${brand.name}", ${accounts.length} social IDs, ${products.length} products.`);
  for (const { role, email } of logins) log(`[seed]   ${role.padEnd(8)} ${email}`);
  return { brand: { id: String(brand._id), name: brand.name }, logins };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  const force = process.argv.includes('--force');
  if (env.isProd && !force) {
    console.error('[seed] Refusing to wipe a production database. Re-run with --force if you really mean it.');
    process.exit(1);
  }
  try {
    const connection = await connectDB();
    const existing = (await User.estimatedDocumentCount()) + (await Brand.estimatedDocumentCount());
    if (existing > 0 && !force) {
      console.error(
        `[seed] Database "${connection.name}" already has ${existing} users/brands. Seeding DELETES ALL DATA.\n` +
          '[seed] Re-run with "npm run seed -- --force" if you really want to replace it.',
      );
      process.exitCode = 1;
    } else {
      await runSeed();
    }
  } catch (err) {
    console.error('[seed] Failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}
