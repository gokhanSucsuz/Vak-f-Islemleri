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

applyFieldEncryption(LogSchema, {
  stringFields: ["details"],
});

export default mongoose.models.Log || mongoose.model("Log", LogSchema);
