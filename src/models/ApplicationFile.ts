import mongoose from 'mongoose';

const ApplicationFileSchema = new mongoose.Schema(
  {
    applicationNo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    sheetName: {
      type: String,
      default: 'Sayfa 1',
      trim: true,
      index: true,
    },
    applicationNoSeq: {
      type: Number,
      index: true,
      default: 0,
    },
    applicantName: {
      type: String,
      default: '',
      trim: true,
    },
    spouseName: {
      type: String,
      default: '',
      trim: true,
    },
    tcNo: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    spouseTcNo: {
      type: String,
      default: '',
      trim: true,
    },
    helpType: {
      type: String,
      default: '',
      trim: true,
    },
    neighborhood: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    fileStatus: {
      type: String,
      default: 'Aktif',
      trim: true,
    },
    applicationDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
    importBatchId: {
      type: String,
      default: '',
      index: true,
    },
    importBatchName: {
      type: String,
      default: '',
    },
    extraData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    columnHeaders: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Başvuru no ve sekme adına göre benzersiz indeks
ApplicationFileSchema.index({ applicationNo: 1, sheetName: 1 }, { unique: true });

// Pre-save hook: compute applicationNoSeq if numeric
ApplicationFileSchema.pre('save', function () {
  if (this.applicationNo) {
    const num = parseInt(this.applicationNo.toString().replace(/\D/g, ''), 10);
    this.applicationNoSeq = !isNaN(num) ? num : 0;
  }
  // If applicantName is empty or only whitespace, adjust fileStatus if default
  if (!this.applicantName || this.applicantName.trim() === '') {
    if (this.fileStatus === 'Aktif') {
      this.fileStatus = 'Boş Dosya';
    }
  } else if (this.fileStatus === 'Boş Dosya' && this.applicantName.trim() !== '') {
    this.fileStatus = 'Aktif';
  }
});

export default mongoose.models.ApplicationFile ||
  mongoose.model('ApplicationFile', ApplicationFileSchema);
