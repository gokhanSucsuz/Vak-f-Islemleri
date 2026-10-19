import mongoose from 'mongoose';

const InKindAidTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    defaultUnit: {
      type: String,
      default: "Adet",
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.InKindAidType || mongoose.model('InKindAidType', InKindAidTypeSchema);
