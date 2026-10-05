import mongoose from 'mongoose';
import { encryptData, decryptData } from '@/lib/encryption';

const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    citizenInfo: {
      type: String,
      required: true,
      set: encryptData,
      get: decryptData,
    },
    helpType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HelpType',
      required: false,
    },
  },
  { 
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
  }
);

export default mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
