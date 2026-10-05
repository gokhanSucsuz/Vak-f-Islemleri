import mongoose from 'mongoose';

const BabyFoodTypeSchema = new mongoose.Schema(
  {
    brand: {
      type: String,
      required: true,
    },
    foodName: {
      type: String,
      required: true,
    },
    weight: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.BabyFoodType || mongoose.model('BabyFoodType', BabyFoodTypeSchema);
