import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    plaudId: {
      type: String,
      required: [true, 'Plaud meeting ID is required'],
      unique: true,
      index: true,
      trim: true,
    },
    sybillConversationId: {
      type: String,
      index: true,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: 'Untitled Meeting',
    },
    sourceId: {
      type: String,
      default: null,
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['PENDING', 'CREATED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    plaudData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sybillRequest: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sybillResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
