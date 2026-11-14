import mongoose, { Schema, Document } from "mongoose";

export interface IPetitionTemplate extends Document {
  type: "detayli" | "matbu";
  fileName: string;
  fileSize: number;
  htmlContent: string;
  docxCompressed?: Buffer;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PetitionTemplateSchema = new Schema<IPetitionTemplate>(
  {
    type: {
      type: String,
      enum: ["detayli", "matbu"],
      required: true,
      unique: true,
    },
    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    htmlContent: { type: String, required: true },
    docxCompressed: { type: Buffer },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.PetitionTemplate ||
  mongoose.model<IPetitionTemplate>("PetitionTemplate", PetitionTemplateSchema);
