import mongoose, { Schema, Document } from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

export interface IPetition extends Document {
  petitionType: "detayli" | "matbu";
  citizenName: string;
  tcNo: string;
  subject?: string;
  contentCompressed: Buffer;
  originalSize: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PetitionSchema = new Schema<IPetition>(
  {
    petitionType: {
      type: String,
      enum: ["detayli", "matbu"],
      required: true,
      index: true,
    },
    citizenName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    tcNo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    subject: {
      type: String,
      trim: true,
      default: "",
    },
    // Gzip ile sıkıştırılmış HTML içerik (~1-2 KB/kayıt) - veritabanı şişmesini önler
    contentCompressed: {
      type: Buffer,
      required: true,
    },
    originalSize: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

PetitionSchema.index({ createdAt: -1 });

applyFieldEncryption(PetitionSchema, {
  stringFields: ["citizenName", "tcNo", "subject"],
  bufferFields: ["contentCompressed"],
});

export default mongoose.models.Petition ||
  mongoose.model<IPetition>("Petition", PetitionSchema);
