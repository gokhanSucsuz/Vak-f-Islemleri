import mongoose from 'mongoose';

const HelpTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.HelpType || mongoose.model('HelpType', HelpTypeSchema);
