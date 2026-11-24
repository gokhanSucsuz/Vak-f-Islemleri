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
    passwordVisible: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['superadmin', 'manager', 'personnel'],
      default: 'personnel',
    },
    title: {
      type: String,
      default: '',
    },
    canManageApplications: {
      type: Boolean,
      default: false,
    },
    authorizedModules: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

applyFieldEncryption(UserSchema, {
  stringFields: ['name', 'passwordVisible'],
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
