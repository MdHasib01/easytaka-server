import mongoose from '../lib/mongoose.js';
import { DIVISIONS } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const smmSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    brand: { type: ObjectId, ref: 'Brand', index: true, default: null },
    designation: { type: String, trim: true, default: 'SMM Executive' },

    // Division policy: an SMM must work in a division other than their NID division.
    nidDivision: { type: String, enum: DIVISIONS, required: true },
    assignedWorkingDivision: { type: String, enum: DIVISIONS },

    // NID images live in Cloudinary as `authenticated` assets; only signed URLs are handed out.
    nid: {
      number: { type: String, trim: true },
      front: { publicId: String, format: String },
      back: { publicId: String, format: String },
    },
    // Self-registered SMMs start Pending; admin-invited (and seeded) SMMs are trusted.
    verification: {
      status: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Verified', index: true },
      note: { type: String, trim: true, maxlength: 2000 },
      reviewedBy: { type: ObjectId, ref: 'User' },
      reviewedAt: Date,
    },

    assignedProductIds: [{ type: ObjectId, ref: 'Product' }],

    // Derived counters, kept in sync by progression.service#syncSmmStats
    managedIds: { type: Number, default: 0 },
    approvedEnrichedIds: { type: Number, default: 0 },

    level: { type: Number, default: 1, min: 1 },
    lifetimeXp: { type: Number, default: 0, min: 0 },
    redeemableXp: { type: Number, default: 0, min: 0 },
    currentStreak: { type: Number, default: 0, min: 0 },
    lastActiveDay: { type: String }, // 'YYYY-MM-DD' in business time

    reviewStats: {
      approved: { type: Number, default: 0 },
      revision: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
    },
    qualityScore: { type: Number, default: 100, min: 0, max: 100 },

    walletBalance: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
    jobHolderUnlocked: { type: Boolean, default: false },
    jobHolderBonusClaimed: { type: Boolean, default: false },
    jobHolderSince: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

smmSchema.pre('validate', function enforceDivisionPolicy() {
  if (
    this.nidDivision &&
    this.assignedWorkingDivision &&
    this.nidDivision === this.assignedWorkingDivision
  ) {
    this.invalidate(
      'assignedWorkingDivision',
      'Working division must be different from the NID division',
    );
  }
});

// Convenience fields when `user` is populated.
smmSchema.virtual('name').get(function name() {
  return this.user?.name;
});
smmSchema.virtual('avatar').get(function avatar() {
  return this.user?.avatar;
});
smmSchema.virtual('isDivisionValid').get(function isDivisionValid() {
  return !this.assignedWorkingDivision || this.nidDivision !== this.assignedWorkingDivision;
});

export const Smm = mongoose.model('Smm', smmSchema);
