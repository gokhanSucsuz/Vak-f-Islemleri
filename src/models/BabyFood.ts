import mongoose from 'mongoose';

const BabyFoodSchema = new mongoose.Schema(
  {
    motherName: {
      type: String,
      required: true,
    },
    motherTc: {
      type: String,
      required: true,
    },
    babyName: {
      type: String,
      required: true,
    },
    foodName: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    weight: {
      type: String,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.BabyFood || mongoose.model('BabyFood', BabyFoodSchema);
