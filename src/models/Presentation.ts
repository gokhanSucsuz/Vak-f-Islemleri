import mongoose, { Schema, Document } from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

export interface ISlideData {
  fullName: string;
  neighborhood: string;
  photoCount: 0 | 1 | 2 | 4;
  photos: string[]; // Sıkıştırılmış JPEG data URI dizisi
  description: string;
  descriptionHtml?: string; // Zengin metin editörü HTML içeriği
  fontFamily?: string; // Varsayılan: "Verdana"
  fontSize?: number | "auto"; // Punto: "auto" veya 7..24
  titleFontSize?: number; // Başlık alanı puntosu (varsayılan: 20, maks: 26, açıklamadan büyük)
  titleBold?: boolean; // Başlık alanı çok kalın mı (varsayılan: true)
  descTopPct?: number; // Açıklama kutusu üst konumu % (44.5..65)
  descBottomPct?: number; // Açıklama kutusu alt konumu % (72..97.5)
  photoWidthPct?: number; // Fotoğraf alanı genişliği % (20..52)
  photoHeightPct?: number; // Fotoğraf alanı yüksekliği % (22..44)
  photoFitMode?: "contain" | "cover" | "fill"; // En-boy oranı modu
  templateId?: string; // Seçilen şablon ID
  backgroundPreset?: string; // Opsiyonel kurum arka plan teması ("template" veya preset ID)
}

export interface IPresentation extends Document {
  meetingId: mongoose.Types.ObjectId;
  summaryTitle: string;
  slideCount: number;
  slidesCompressed: Buffer;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  lockedBy?: mongoose.Types.ObjectId | null;
  lockedAt?: Date | null;
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
    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
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
