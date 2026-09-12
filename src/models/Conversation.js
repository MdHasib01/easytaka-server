import mongoose from '../lib/mongoose.js';

const { ObjectId } = mongoose.Schema.Types;

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: ObjectId, ref: 'User' }],
      validate: [(v) => v.length >= 2, 'A conversation needs at least two participants'],
      index: true,
    },
    brand: { type: ObjectId, ref: 'Brand' },
    topic: { type: String, trim: true, maxlength: 160 },
    relatedAccount: { type: ObjectId, ref: 'SocialAccount', default: null },
    relatedMission: { type: ObjectId, ref: 'Mission', default: null },
    lastMessage: {
      content: String,
      sender: { type: ObjectId, ref: 'User' },
      at: Date,
    },
    // Per-participant read marker used to compute unread counts.
    reads: [
      new mongoose.Schema({ user: { type: ObjectId, ref: 'User' }, at: Date }, { _id: false }),
    ],
  },
  { timestamps: true },
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
