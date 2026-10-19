import mongoose from 'mongoose';

const InKindAidSchema = new mongoose.Schema(
  {
    tcNo: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },
    citizenName: {
      type: String,
      required: true,
      trim: true,
    },
    receiver: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    items: [
      {
        aidType: { type: String, required: true },
        specification: { type: String, default: "" },
        unit: { type: String, required: true, default: "Adet" },
        quantity: { type: Number, required: true, min: 1 },
      }
    ],
    notes: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

InKindAidSchema.pre('save', function (this: any, next: any) {
  if (!this.tcNo && this.citizenName) {
    const match = this.citizenName.match(/\b\d{11}\b/);
    if (match) {
      this.tcNo = match[0];
    }
  }
  next();
});

export default mongoose.models.InKindAid || mongoose.model('InKindAid', InKindAidSchema);
