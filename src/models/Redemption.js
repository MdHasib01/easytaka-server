import mongoose from '../lib/mongoose.js';

const { ObjectId } = mongoose.Schema.Types;

const redemptionSchema = new mongoose.Schema(
  {
    smm: { type: ObjectId, ref: 'Smm', required: true, index: true },
    brand: { type: ObjectId, ref: 'Brand', index: true },
    item: { type: ObjectId, ref: 'RewardItem', required: true },
    title: { type: String, required: true }, // snapshot of the item title
    cost: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['Pending', 'Fulfilled', 'Cancelled'], default: 'Pending' },
    processedBy: { type: ObjectId, ref: 'User' },
    processedAt: Date,
    note: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

export const Redemption = mongoose.model('Redemption', redemptionSchema);
