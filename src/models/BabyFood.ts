import mongoose from 'mongoose';

const BabyFoodSchema = new mongoose.Schema(
  {
    motherInfo: {
      type: String,
      required: true,
    },
    receiver: {
      type: String,
      default: "",
    },
    babyName: {
      type: String,
      required: true,
    },
    items: [
      {
        brand: { type: String, required: true },
        foodName: { type: String, required: true },
        weight: { type: String, required: true },
        quantity: { type: Number, required: true },
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.BabyFood || mongoose.model('BabyFood', BabyFoodSchema);
