import mongoose from '../lib/mongoose.js';
import { PLATFORMS } from '../constants.js';
import { defaultEnrichmentStages } from '../config/enrichmentTemplate.js';
import { checklistTemplateSchema, requirementSchema } from './shared.js';

const { Schema } = mongoose;

const stageConfigSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    weight: { type: Number, required: true, min: 0, max: 100 },
    required: { type: Boolean, default: true },
    xpReward: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true },
    checklist: { type: [checklistTemplateSchema], default: [] },
    requirement: { type: requirementSchema, default: () => ({}) },
  },
  { _id: false, id: false },
);

export const activeStageWeight = (stages = []) =>
  stages.filter((s) => s.active).reduce((sum, s) => sum + (s.weight || 0), 0);

const brandSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    logo: { type: String, default: '🏷️' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    industry: { type: String, trim: true, maxlength: 120 },
    primaryPlatform: { type: String, enum: PLATFORMS, default: 'Facebook' },
    // Shown in the "Add New ID" wizard, e.g. firstname.milkimom.number@gmail.com
    emailGuideline: { type: String, trim: true, maxlength: 200 },
    settings: {
      productsPerSmm: { type: Number, min: 1, default: 4 },
      jobHolderThreshold: { type: Number, min: 1, default: 20 },
      jobHolderBonusCash: { type: Number, min: 0, default: 100 },
      jobHolderBonusXp: { type: Number, min: 0, default: 200 },
      fullEnrichmentReward: { type: Number, min: 0, default: 20 },
      weeklyBaseSalary: { type: Number, min: 0, default: 750 },
      minWithdrawal: { type: Number, min: 0, default: 100 },
    },
    enrichmentStages: {
      type: [stageConfigSchema],
      default: defaultEnrichmentStages,
      validate: [
        {
          validator: (stages) => activeStageWeight(stages) === 100,
          message: (props) =>
            `Active enrichment stage weights must total 100 (currently ${activeStageWeight(props.value)})`,
        },
        {
          validator: (stages) => new Set(stages.map((s) => s.id)).size === stages.length,
          message: 'Enrichment stage ids must be unique',
        },
      ],
    },
  },
  { timestamps: true },
);

export const Brand = mongoose.model('Brand', brandSchema);
