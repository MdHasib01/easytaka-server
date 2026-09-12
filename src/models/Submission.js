import mongoose from '../lib/mongoose.js';
import { SUBMISSION_STATUSES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

// One SMM's execution of a mission / rapid task, from start through review.
const submissionSchema = new mongoose.Schema(
  {
    brand: { type: ObjectId, ref: 'Brand', required: true, index: true },
    mission: { type: ObjectId, ref: 'Mission', required: true },
    isRapid: { type: Boolean, default: false },
    smm: { type: ObjectId, ref: 'Smm', required: true, index: true },
    accounts: [{ type: ObjectId, ref: 'SocialAccount' }],

    periodKey: { type: String, required: true }, // day / ISO week / 'once'
    // Prevents duplicate executions (per account+period for missions, per SMM for rapid tasks).
    dedupeKey: { type: String, required: true, unique: true },

    status: { type: String, enum: SUBMISSION_STATUSES, default: 'In Progress', index: true },
    proof: {
      url: { type: String, trim: true },
      screenshots: { type: [String], default: [] },
      notes: { type: String, trim: true, maxlength: 2000 },
    },
    submittedAt: Date,

    reviewerNote: { type: String, trim: true, maxlength: 2000 },
    reviewedBy: { type: ObjectId, ref: 'User' },
    reviewedAt: Date,

    rewardPaid: { type: Number, default: 0 },
    xpAwarded: { type: Number, default: 0 },
  },
  { timestamps: true, optimisticConcurrency: true },
);

submissionSchema.index({ mission: 1, periodKey: 1, status: 1 });
submissionSchema.index({ brand: 1, isRapid: 1, status: 1 });

export const Submission = mongoose.model('Submission', submissionSchema);
