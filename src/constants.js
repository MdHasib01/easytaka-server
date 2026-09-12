export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  REVIEWER: 'REVIEWER',
  SMM: 'SMM',
});

export const STAFF_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.REVIEWER];
export const MANAGEMENT_ROLES = [ROLES.ADMIN, ROLES.MANAGER];

export const DIVISIONS = [
  'Dhaka',
  'Chattogram',
  'Khulna',
  'Rajshahi',
  'Barishal',
  'Sylhet',
  'Rangpur',
  'Mymensingh',
];

export const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'X'];

export const ACCOUNT_STATUSES = [
  'New',
  'Enrichment Started',
  'Under Review',
  'Revision Required',
  'Approved',
  'Eligible',
  'Locked',
];

export const APPROVAL_STATUSES = ['Approved', 'Under Review', 'Revision Required'];

export const STAGE_STATUSES = [
  'Locked',
  'Available',
  'Ready to Submit',
  'Under Review',
  'Approved',
  'Revision Required',
  'Rejected',
];

export const SUBMITTABLE_STAGE_STATUSES = ['Available', 'Ready to Submit', 'Revision Required'];

export const REQUIREMENT_TYPES = ['none', 'personaComplete', 'contentEntries', 'notes'];

export const REVIEW_ACTIONS = ['Approve', 'Revision', 'Reject'];

export const RECURRENCES = ['Daily', 'Weekly', 'One-time'];
export const ASSIGN_TO = ['All Eligible SMMs', 'Specific SMMs', 'Tier'];
export const URGENCIES = ['Low', 'Medium', 'High', 'Critical'];
export const MISSION_STATUSES = ['Active', 'Paused', 'Completed', 'Archived'];

export const SUBMISSION_STATUSES = [
  'In Progress',
  'Submitted',
  'Revision Required',
  'Completed',
  'Rejected',
];

export const TRANSACTION_CATEGORIES = [
  'salary',
  'mission_reward',
  'rapid_reward',
  'enrichment_reward',
  'bonus',
  'withdrawal',
  'adjustment',
];

export const PAYOUT_METHODS = ['bKash', 'Nagad', 'Rocket', 'Bank'];

export const XP_PER_LEVEL = 200;
export const MAX_LEVEL = 10;

// Persona fields that count towards persona completeness.
export const PERSONA_TEXT_FIELDS = [
  'fullName',
  'username',
  'displayName',
  'ageRange',
  'gender',
  'location',
  'occupation',
  'education',
  'relationshipContext',
  'interests',
  'hobbies',
  'lifestyle',
  'personalityTraits',
  'writingStyle',
  'toneOfVoice',
  'commonVocabulary',
  'preferredLanguage',
  'languageMix',
  'emojiStyle',
  'postingStyle',
  'commentStyle',
  'likedTopics',
  'avoidedTopics',
  'brandRelevance',
  'specialNotes',
];
export const PERSONA_MEDIA_FIELDS = ['avatar', 'coverPhoto'];
export const PERSONA_FIELDS = [...PERSONA_MEDIA_FIELDS, ...PERSONA_TEXT_FIELDS];
