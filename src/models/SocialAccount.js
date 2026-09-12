import mongoose from '../lib/mongoose.js';
import {
  ACCOUNT_STATUSES,
  APPROVAL_STATUSES,
  PERSONA_FIELDS,
  PERSONA_TEXT_FIELDS,
  PLATFORMS,
  STAGE_STATUSES,
} from '../constants.js';
import { checklistItemSchema, requirementSchema } from './shared.js';

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const personaSchema = new Schema(
  {
    avatar: { type: String, trim: true },
    coverPhoto: { type: String, trim: true },
    ...Object.fromEntries(
      PERSONA_TEXT_FIELDS.map((f) => [f, { type: String, trim: true, maxlength: 1000 }]),
    ),
    completeness: { type: Number, default: 0 },
  },
  { _id: false },
);

export function personaCompleteness(persona) {
  if (!persona) return 0;
  const filled = PERSONA_FIELDS.filter((f) => String(persona[f] ?? '').trim().length > 0).length;
  return Math.round((filled / PERSONA_FIELDS.length) * 100);
}

const noteSchema = new Schema(
  {
    type: { type: String, trim: true, default: 'Persona Memory', maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    product: { type: String, trim: true, maxlength: 160 },
    relatedMission: { type: String, trim: true, maxlength: 160 },
    date: { type: Date, default: Date.now },
    tags: { type: [String], default: [] },
    isImportant: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    commentContext: {
      type: new Schema(
        {
          originalComment: { type: String, trim: true, maxlength: 2000 },
          context: { type: String, trim: true, maxlength: 500 },
          tone: { type: String, trim: true, maxlength: 60 },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

const contentEntrySchema = new Schema({
  type: { type: String, trim: true, default: 'Post', maxlength: 60 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  date: { type: Date, default: Date.now },
  url: { type: String, trim: true },
  screenshot: { type: String, trim: true },
  note: { type: String, trim: true, maxlength: 2000 },
  relatedProduct: { type: String, trim: true, maxlength: 160 },
});

const stageSubmissionSchema = new Schema(
  {
    screenshots: { type: [String], default: [] },
    profileUrl: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 2000 },
    checklistConfirmed: { type: Boolean, default: false },
    relatedProduct: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['Pending', 'Submitted', 'Revision', 'Approved', 'Rejected'],
      default: 'Submitted',
    },
    reviewerNote: { type: String, trim: true, maxlength: 2000 },
    reviewedBy: { type: ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { _id: false },
);

const accountStageSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    xpReward: { type: Number, default: 0 },
    required: { type: Boolean, default: true },
    status: { type: String, enum: STAGE_STATUSES, default: 'Locked' },
    checklist: { type: [checklistItemSchema], default: [] },
    requirement: { type: requirementSchema, default: () => ({}) },
    submission: { type: stageSubmissionSchema, default: undefined },
  },
  { _id: false, id: false },
);

const historySchema = new Schema({
  date: { type: Date, default: Date.now },
  stageId: String,
  stageName: String,
  status: { type: String, enum: ['Approved', 'Revision Required', 'Rejected', 'Submitted'] },
  reviewer: String, // display name of whoever performed the action
  reviewerId: { type: ObjectId, ref: 'User' },
  note: String,
  xpAwarded: { type: Number, default: 0 },
  progressBefore: Number,
  progressAfter: Number,
});

const socialAccountSchema = new Schema(
  {
    smm: { type: ObjectId, ref: 'Smm', required: true, index: true },
    brand: { type: ObjectId, ref: 'Brand', required: true, index: true },
    serial: { type: Number, required: true, min: 1 }, // per-SMM running number ("ID #17")

    name: { type: String, required: true, trim: true, maxlength: 120 },
    platform: { type: String, enum: PLATFORMS, default: 'Facebook' },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    profileUrl: { type: String, trim: true },

    status: { type: String, enum: ACCOUNT_STATUSES, default: 'Enrichment Started', index: true },
    enrichmentPercent: { type: Number, default: 0, min: 0, max: 100 },
    approvalStatus: { type: String, enum: APPROVAL_STATUSES, default: null },
    fullEnrichmentRewardGranted: { type: Boolean, default: false },

    stages: { type: [accountStageSchema], default: [] },
    persona: { type: personaSchema, default: undefined },
    notes: { type: [noteSchema], default: [] },
    contentEntries: { type: [contentEntrySchema], default: [] },
    history: { type: [historySchema], default: [] },

    credentials: {
      passwordEnc: { type: String, select: false },
      hasPassword: { type: Boolean, default: false },
      twoFactorEnabled: { type: Boolean, default: false },
      twoFactorMethod: { type: String, trim: true, maxlength: 60 },
      updatedAt: Date,
    },

    lastActivityAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    // Stops two reviewers from approving the same stage concurrently.
    optimisticConcurrency: true,
    toJSON: {
      transform(_doc, ret) {
        // Never serialise the encrypted password, even on freshly created docs.
        if (ret.credentials) delete ret.credentials.passwordEnc;
        return ret;
      },
    },
  },
);

socialAccountSchema.index({ smm: 1, serial: 1 }, { unique: true });
socialAccountSchema.index({ platform: 1, email: 1 }, { unique: true });
socialAccountSchema.index({ brand: 1, 'stages.status': 1 });

socialAccountSchema.pre('validate', function computePersonaCompleteness() {
  if (this.persona) this.persona.completeness = personaCompleteness(this.persona);
});

socialAccountSchema.virtual('smmId').get(function smmId() {
  return this.smm?._id ?? this.smm;
});
socialAccountSchema.virtual('code').get(function code() {
  return `ID-${String(this.serial).padStart(3, '0')}`;
});

export const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);
