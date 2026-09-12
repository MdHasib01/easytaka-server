import mongoose from '../lib/mongoose.js';
import { PAYOUT_METHODS, TRANSACTION_CATEGORIES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const transactionSchema = new mongoose.Schema(
  {
    smm: { type: ObjectId, ref: 'Smm', required: true, index: true },
    brand: { type: ObjectId, ref: 'Brand', index: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    category: { type: String, enum: TRANSACTION_CATEGORIES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 300 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['Completed', 'Pending', 'Rejected'], default: 'Completed' },
    balanceAfter: Number,
    // Idempotency key so the same reward/salary can never be paid twice.
    reference: { type: String, unique: true, sparse: true },
    payout: {
      method: { type: String, enum: PAYOUT_METHODS },
      accountNumber: { type: String, trim: true, maxlength: 40 },
    },
    note: { type: String, trim: true, maxlength: 500 },
    processedBy: { type: ObjectId, ref: 'User' },
    processedAt: Date,
  },
  { timestamps: true },
);

transactionSchema.index({ smm: 1, createdAt: -1 });

transactionSchema.virtual('amountLabel').get(function amountLabel() {
  return `${this.type === 'credit' ? '+' : '-'}৳${this.amount}`;
});

export const Transaction = mongoose.model('Transaction', transactionSchema);
