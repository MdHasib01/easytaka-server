// Seed content mirroring client/src/data/mockData.ts.

export const products = [
  { name: 'Milkimom Standard 400g', sku: 'MM-400-STD', type: 'Formula', shortDescription: 'Standard infant formula' },
  { name: 'Milkimom Premium 400g', sku: 'MM-400-PRM', type: 'Formula', shortDescription: 'Premium infant formula' },
  { name: 'Milkimom Gold 800g', sku: 'MM-800-GLD', type: 'Formula', shortDescription: 'Gold standard formula' },
  { name: 'Milkimom Care 400g', sku: 'MM-400-CRE', type: 'Formula', shortDescription: 'Special care formula' },
];

export const personas = {
  0: {
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
    coverPhoto: 'https://images.unsplash.com/photo-1555529733-0e67056058e1?q=80&w=600&auto=format&fit=crop',
    fullName: 'Nusrat Jahan',
    username: 'nusrat.jahan24',
    displayName: 'Nusrat Jahan',
    ageRange: '24–28',
    gender: 'Female',
    location: 'Dhaka',
    occupation: 'Working Professional',
    education: 'BBA',
    relationshipContext: 'Married, 1 young child',
    interests: 'Parenting, cooking, home decor, lifestyle',
    hobbies: 'Reading, baking',
    lifestyle: 'Young Working Professional, busy but organized',
    personalityTraits: 'Friendly, warm, practical',
    writingStyle: 'Conversational, helpful, uses emojis naturally',
    toneOfVoice: 'Friendly, casual, slightly expressive',
    commonVocabulary: 'Alhamdulillah, shundor, simple, easy',
    preferredLanguage: 'Bangla',
    languageMix: 'Bangla + light Banglish',
    emojiStyle: 'Moderate (😊, ❤️, ✨)',
    postingStyle: 'Personal lifestyle + daily observations',
    commentStyle: 'Encouraging, shares personal experience',
    likedTopics: 'Baby food, family, home routine, productivity',
    avoidedTopics: 'Politics, controversial news',
    brandRelevance: 'High',
    specialNotes: 'Focuses heavily on time-saving tips for working moms.',
  },
  1: {
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
    coverPhoto: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=600&auto=format&fit=crop',
    fullName: 'Sadia Ahmed',
    username: 'sadia.ahmed99',
    displayName: 'Sadia',
    ageRange: '28–32',
    gender: 'Female',
    location: 'Chattogram',
    occupation: 'Teacher',
    education: 'MA',
    relationshipContext: 'Married, 2 kids',
    interests: 'Education, child development, local events',
    hobbies: 'Gardening, crafts',
    lifestyle: 'Family-centered, structured',
    personalityTraits: 'Patient, knowledgeable, warm',
    writingStyle: 'Structured, polite, informative',
    toneOfVoice: 'Professional + warm',
    commonVocabulary: 'Valo, bacha, somoy, porashona',
    preferredLanguage: 'Bangla',
    languageMix: 'Bangla dominant',
    emojiStyle: 'Minimal (👍, 🌸)',
    postingStyle: 'Educational tips, family outings',
    commentStyle: 'Detailed, offers advice',
    likedTopics: 'School, parenting tips, healthy meals',
    avoidedTopics: 'Gossips, drama',
    brandRelevance: 'Medium',
    specialNotes: 'Likes to compare products based on ingredients.',
  },
};

export const firstAccountNotes = () => [
  {
    type: 'Comment History',
    title: 'Baby food discussion',
    content: 'This persona commented positively about homemade baby food and mentioned using simple ingredients.',
    product: 'Milkimom Standard',
    tags: ['baby-food', 'parenting', 'home-cooking'],
    isPinned: true,
    commentContext: {
      originalComment: 'Amar basay ami usually simple food e beshi comfortable.',
      context: 'Parenting discussion on local group',
      tone: 'Casual',
    },
  },
  {
    type: 'Persona Memory',
    title: 'Lifestyle note',
    content: 'Recently mentioned work-from-home lifestyle.',
    product: 'General',
    tags: ['wfh', 'lifestyle'],
    isImportant: true,
  },
  {
    type: 'Tone',
    title: 'Emoji usage',
    content: 'Uses 😊 and ❤️ in almost every comment; never uses more than two emojis.',
    product: 'General',
    tags: ['tone', 'emoji'],
  },
  {
    type: 'Persona Memory',
    title: 'Child age',
    content: 'Child is 14 months old; has mentioned switching formula once before.',
    product: 'Milkimom Gold',
    tags: ['family'],
    isImportant: true,
  },
  {
    type: 'Comment History',
    title: 'Premium formula question',
    content: 'Asked a friend about the price difference between Standard and Premium.',
    product: 'Milkimom Premium',
    tags: ['pricing'],
  },
];

const CONTENT_TYPES = ['Post', 'Photo', 'Story', 'Reel', 'Share'];

export const contentEntries = (accountIndex) =>
  Array.from({ length: 10 }, (_, i) => ({
    type: CONTENT_TYPES[i % CONTENT_TYPES.length],
    title: `Foundation content #${i + 1}`,
    url: `https://facebook.com/rafi.milkimom.${accountIndex + 1}/posts/${1000 + i}`,
    note: 'Lifestyle content aligned with the persona voice.',
  }));

export const rewardItems = [
  { title: '1GB Mobile Data', cost: 500, icon: 'Wifi', description: 'Any Bangladeshi operator' },
  { title: '৳100 Bonus Voucher', cost: 800, icon: 'Gift', description: 'Credited to your wallet after approval' },
  { title: 'Streak Shield', cost: 1500, icon: 'Star', description: 'Protects your work streak for one missed day' },
  { title: 'Coffee Shop Gift Card', cost: 2500, icon: 'Coffee', description: 'Partner coffee shops in Dhaka', stock: 25 },
];
