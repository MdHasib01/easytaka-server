import mongoose from '../lib/mongoose.js';
import { REQUIREMENT_TYPES } from '../constants.js';

const { Schema } = mongoose;

// Stage sub-schemas use a string `id` (e.g. 'stg4') instead of an ObjectId,
// because the client keys stage-specific rules off those ids.

export const checklistTemplateSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false, id: false },
);

export const checklistItemSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 300 },
    checked: { type: Boolean, default: false },
  },
  { _id: false, id: false },
);

export const requirementSchema = new Schema(
  {
    type: { type: String, enum: REQUIREMENT_TYPES, default: 'none' },
    min: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);
