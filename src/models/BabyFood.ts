import mongoose from 'mongoose';

const BabyFoodSchema = new mongoose.Schema(
  {
    tcNo: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },
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
    deliveryDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

BabyFoodSchema.pre('save', function (this: any) {
  if (!this.tcNo && this.motherInfo) {
    const match = this.motherInfo.match(/\b\d{11}\b/);
    if (match) {
      this.tcNo = match[0];
    }
  }
  if (!this.deliveryDate) {
    this.deliveryDate = new Date();
  }
});

export default mongoose.models.BabyFood || mongoose.model('BabyFood', BabyFoodSchema);
