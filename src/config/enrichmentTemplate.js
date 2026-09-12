// Default enrichment pipeline for a new brand. Mirrors the Brand Details > Enrichment
// Configuration screen in the client (stage ids stg1..stg8, weights totalling 100).

const checklist = (stageId, labels) =>
  labels.map((label, i) => ({ id: `${stageId}-c${i + 1}`, label }));

export const defaultEnrichmentStages = () => [
  {
    id: 'stg1',
    name: 'Account Setup & Security',
    weight: 10,
    required: true,
    xpReward: 50,
    active: true,
    requirement: { type: 'none', min: 0 },
    checklist: checklist('stg1', [
      'Email created following the brand guideline',
      '2FA enabled on email and social account',
      'Recovery phone / email added',
    ]),
  },
  {
    id: 'stg2',
    name: 'Profile Identity Complete',
    weight: 15,
    required: true,
    xpReward: 100,
    active: true,
    requirement: { type: 'none', min: 0 },
    checklist: checklist('stg2', [
      'Profile photo uploaded',
      'Cover photo uploaded',
      'Display name matches the persona',
    ]),
  },
  {
    id: 'stg3',
    name: 'Profile Information Complete',
    weight: 15,
    required: true,
    xpReward: 100,
    active: true,
    requirement: { type: 'none', min: 0 },
    checklist: checklist('stg3', [
      'Bio / intro added',
      'Location, work and education filled',
      'Relationship status and interests set',
    ]),
  },
  {
    id: 'stg4',
    name: 'Persona Setup Complete',
    weight: 15,
    required: true,
    xpReward: 150,
    active: true,
    requirement: { type: 'personaComplete', min: 100 },
    checklist: checklist('stg4', [
      'All persona fields completed',
      'Tone of voice and language style defined',
    ]),
  },
  {
    id: 'stg5',
    name: 'Content Foundation',
    weight: 15,
    required: true,
    xpReward: 200,
    active: true,
    requirement: { type: 'contentEntries', min: 10 },
    checklist: checklist('stg5', [
      '10 foundational content pieces published',
      'Content matches the persona voice',
    ]),
  },
  {
    id: 'stg6',
    name: 'Account Activity / Readiness',
    weight: 10,
    required: true,
    xpReward: 100,
    active: true,
    requirement: { type: 'none', min: 0 },
    checklist: checklist('stg6', [
      'Joined 5+ relevant groups / communities',
      'Added 20+ genuine friends or follows',
      'Consistent daily activity for 7 days',
    ]),
  },
  {
    id: 'stg7',
    name: 'Persona Notes & Consistency',
    weight: 10,
    required: true,
    xpReward: 100,
    active: true,
    requirement: { type: 'notes', min: 5 },
    checklist: checklist('stg7', [
      '5 context notes saved',
      'Comment history is consistent with the persona',
    ]),
  },
  {
    id: 'stg8',
    name: 'Final Eligibility Review',
    weight: 10,
    required: true,
    xpReward: 250,
    active: true,
    requirement: { type: 'none', min: 0 },
    checklist: checklist('stg8', [
      'Account is healthy (no restrictions or warnings)',
      'All previous stages approved',
    ]),
  },
];
