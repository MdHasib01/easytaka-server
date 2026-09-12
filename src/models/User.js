import bcrypt from 'bcryptjs';
import mongoose from '../lib/mongoose.js';
import { ROLES } from '../constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, maxlength: 30 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.SMM, index: true },
    // Null for platform-wide admins; every other user belongs to exactly one brand.
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true, default: null },
    avatar: { type: String, trim: true },
    status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  },
);

userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model('User', userSchema);
