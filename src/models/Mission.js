import mongoose from '../lib/mongoose.js';
import { ASSIGN_TO, MISSION_STATUSES, PLATFORMS, RECURRENCES, URGENCIES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

// Regular missions and rapid tasks share one model; `isRapid` separates them.
const missionSchema = new mongoose.Schema(
  {
    brand: { type: ObjectId, ref: 'Brand', required: true, index: true },
    product: { type: ObjectId, ref: 'Product', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, trim: true, default: 'Engagement', maxlength: 60 },
    platform: { type: String, enum: PLATFORMS, default: 'Facebook' },
    isRapid: { type: Boolean, default: false, index: true },

    recurrence: { type: String, enum: RECURRENCES, default: 'Daily' },
    assignTo: { type: String, enum: ASSIGN_TO, default: 'All Eligible SMMs' },
    assignedSmms: [{ type: ObjectId, ref: 'Smm' }],
    minLevel: { type: Number, min: 1 },

    instructions: { type: String, trim: true, maxlength: 5000, default: '' },
    link: { type: String, trim: true },

    reward: { type: Number, min: 0, default: 0 }, // cash (৳) per approved completion
    xpReward: { type: Number, min: 0, default: 0 },
    // Completion slots per period (per day for Daily, per week for Weekly, total otherwise).
    targetCompletions: { type: Number, min: 1, default: 10 },
    completedCount: { type: Number, min: 0, default: 0 }, // all-time approved completions

    // Rapid task fields
    urgency: { type: String, enum: URGENCIES, default: 'High' },
    timeLimitHours: { type: Number, min: 1 },
    requiredIds: { type: Number, min: 1, default: 1 },

    startsAt: { type: Date, default: Date.now },
    deadline: { type: Date, default: null },
    status: { type: String, enum: MISSION_STATUSES, default: 'Active', index: true },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

missionSchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.deadline && this.deadline.getTime() <= Date.now());
});

missionSchema.virtual('timeLeft').get(function timeLeft() {
  if (!this.deadline) return null;
  const ms = this.deadline.getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  return `${minutes} min left`;
});

missionSchema.virtual('productName').get(function productName() {
  return this.product?.name;
});

export const Mission = mongoose.model('Mission', missionSchema);
