import mongoose from 'mongoose';

const logSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: [true, 'Event name is required'],
      index: true,
      trim: true,
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug'],
      default: 'info',
      index: true,
    },
    message: {
      type: String,
      required: [true, 'Log message is required'],
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Log = mongoose.model('Log', logSchema);

export default Log;
