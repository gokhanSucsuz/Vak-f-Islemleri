import mongoose, { Schema, Document } from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

export interface IPresentationTemplate extends Document {
  key: string;
  fileName: string;
  fileSize: number;
  backgroundImageBase64: string;
  slideWidthIn: number;
  slideHeightIn: number;
  pptxCompressed?: Buffer;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PresentationTemplateSchema = new Schema<IPresentationTemplate>(
  {
    key: {
      type: String,
      default: "default",
      unique: true,
      required: true,
    },
    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    backgroundImageBase64: { type: String, default: "" },
    slideWidthIn: { type: Number, default: 10 },
    slideHeightIn: { type: Number, default: 7.5 },
    pptxCompressed: { type: Buffer },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

applyFieldEncryption(PresentationTemplateSchema, {
  stringFields: ["backgroundImageBase64"],
  bufferFields: ["pptxCompressed"],
});

export default mongoose.models.PresentationTemplate ||
  mongoose.model<IPresentationTemplate>("PresentationTemplate", PresentationTemplateSchema);
