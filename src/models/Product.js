import mongoose from '../lib/mongoose.js';

const productSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 },
    type: { type: String, trim: true, maxlength: 60 },
    shortDescription: { type: String, trim: true, maxlength: 500 },
    image: { type: String, trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true },
);

productSchema.index({ brand: 1, sku: 1 }, { unique: true });

export const Product = mongoose.model('Product', productSchema);
