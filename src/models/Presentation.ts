import mongoose, { Schema, Document } from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

export interface ISlideData {
  fullName: string;
  neighborhood: string;
  photoCount: 0 | 1 | 2 | 4;
  photos: string[]; // Sıkıştırılmış JPEG data URI dizisi
  description: string;
  fontSize?: number | "auto"; // Punto: "auto" veya 8..18
  descTopPct?: number; // Açıklama kutusu üst konumu % (44.5..65)
  descBottomPct?: number; // Açıklama kutusu alt konumu % (72..97.5)
  templateId?: string; // Seçilen şablon ID
}

export interface IPresentation extends Document {
  meetingId: mongoose.Types.ObjectId;
  summaryTitle: string;
  slideCount: number;
  slidesCompressed: Buffer;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PresentationSchema = new Schema<IPresentation>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "PresentationMeeting",
      required: true,
      index: true,
    },
    summaryTitle: {
      type: String,
      required: true,
      trim: true,
    },
    slideCount: {
      type: Number,
      default: 1,
    },
    // Gzip + AES-256-GCM ile şifrelenmiş slayt dizisi (metin + sıkıştırılmış fotoğraflar)
    slidesCompressed: {
      type: Buffer,
      required: true,
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

PresentationSchema.index({ createdAt: -1 });

applyFieldEncryption(PresentationSchema, {
  stringFields: ["summaryTitle"],
  bufferFields: ["slidesCompressed"],
});

export default mongoose.models.Presentation ||
  mongoose.model<IPresentation>("Presentation", PresentationSchema);
