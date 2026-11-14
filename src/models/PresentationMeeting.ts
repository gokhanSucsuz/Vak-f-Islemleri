import mongoose, { Schema, Document } from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

export interface ISlideOrderItem {
  presentationId: string;
  slideIndex: number;
}

export interface IPresentationMeeting extends Document {
  title: string;
  meetingDate: Date;
  status: "open" | "closed";
  openedBy: mongoose.Types.ObjectId;
  closedBy?: mongoose.Types.ObjectId;
  closedAt?: Date;
  slideOrder: ISlideOrderItem[];
  downloadedAt?: Date;
  photosExpireAt?: Date;
  photosPurged: boolean;
  photosPurgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PresentationMeetingSchema = new Schema<IPresentationMeeting>(
  {
    title: { type: String, required: true, trim: true },
    meetingDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    openedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closedAt: { type: Date },
    slideOrder: {
      type: [
        {
          presentationId: { type: String, required: true },
          slideIndex: { type: Number, required: true },
        },
      ],
      default: [],
    },
    downloadedAt: { type: Date },
    photosExpireAt: { type: Date, index: true },
    photosPurged: { type: Boolean, default: false },
    photosPurgedAt: { type: Date },
  },
  { timestamps: true }
);

PresentationMeetingSchema.index({ createdAt: -1 });

applyFieldEncryption(PresentationMeetingSchema, {
  stringFields: ["title"],
});

export default mongoose.models.PresentationMeeting ||
  mongoose.model<IPresentationMeeting>("PresentationMeeting", PresentationMeetingSchema);
