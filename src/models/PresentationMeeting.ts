import mongoose, { Schema, Document } from "mongoose";
import { applyFieldEncryption } from "@/lib/encryption";

export interface IPresentationMeeting extends Document {
  title: string;
  meetingDate: Date;
  status: "open" | "closed";
  isLocked: boolean;
  authorizedUserId?: mongoose.Types.ObjectId;
  openedBy: mongoose.Types.ObjectId;
  closedBy?: mongoose.Types.ObjectId;
  closedAt?: Date;
  presentationOrder: string[];
  backgroundPreset?: string;
  photoFramePreset?: string;
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
    isLocked: {
      type: Boolean,
      default: false,
    },
    authorizedUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    openedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closedAt: { type: Date },
    presentationOrder: {
      type: [String],
      default: [],
    },
    backgroundPreset: {
      type: String,
      default: "template",
    },
    photoFramePreset: {
      type: String,
      default: "none",
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
