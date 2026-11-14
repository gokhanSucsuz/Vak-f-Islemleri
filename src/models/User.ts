import mongoose from 'mongoose';
import { applyFieldEncryption } from '@/lib/encryption';

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['superadmin', 'manager', 'personnel'],
      default: 'personnel',
    },
    canManageApplications: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

applyFieldEncryption(UserSchema, {
  stringFields: ['name'],
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
