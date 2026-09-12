import mongoose from '../lib/mongoose.js';

const rewardItemSchema = new mongoose.Schema(
  {
    // Null = available to every brand's SMMs.
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    cost: { type: Number, required: true, min: 1 }, // redeemable XP
    icon: { type: String, trim: true, default: 'Gift' }, // lucide-react icon name
    stock: { type: Number, min: 0, default: null }, // null = unlimited
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const RewardItem = mongoose.model('RewardItem', rewardItemSchema);
