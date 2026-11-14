import mongoose, { Schema, Document } from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

export interface ITemplateBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface ITemplateLayoutConfig {
  version?: number;
  mode: "classic" | "title_only" | "blank_text" | "title_and_desc" | "multi_slot";
  titleBox: ITemplateBox | null;
  descBox: ITemplateBox | null;
  photoSlots: ITemplateBox[];
}

export interface IPresentationTemplate extends Document {
  name: string;
  fileName: string;
  fileSize: number;
  backgroundImageBase64: string;
  slideWidthIn: number;
  slideHeightIn: number;
  layoutConfig?: ITemplateLayoutConfig;
  pptxCompressed?: Buffer;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PresentationTemplateSchema = new Schema<IPresentationTemplate>(
  {
    name: { type: String, required: true, trim: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    backgroundImageBase64: { type: String, default: "" },
    slideWidthIn: { type: Number, default: 10 },
    slideHeightIn: { type: Number, default: 7.5 },
    layoutConfig: { type: Schema.Types.Mixed },
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
