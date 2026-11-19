import mongoose from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

const LogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  details: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

LogSchema.index({ createdAt: -1 });
LogSchema.index({ userId: 1, createdAt: -1 });

applyFieldEncryption(LogSchema, {
  stringFields: ["details"],
});

export default mongoose.models.Log || mongoose.model("Log", LogSchema);
