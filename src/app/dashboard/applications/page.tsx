"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  UploadCloud,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  Trash2,
  Edit3,
  ShieldCheck,
  UserCheck,
  X,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Hash,
  User as UserIcon,
  Phone,
  MapPin,
  HelpCircle,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Calendar,
  ArrowUpDown,
  Download,
  RotateCcw,
  Check,
} from "lucide-react";
import { turkishIncludes, exportStyledApplicationExcel } from "@/lib/turkish";
import ModernConfirmDialog, { DialogType } from "@/components/ModernConfirmDialog";

interface ApplicationFileRecord {
  _id: string;
  applicationNo: string;
  applicationNoSeq: number;
  applicantName: string;
  tcNo: string;
  phone: string;
  address: string;
  fileStatus: string;
  notes?: string;
  extraData?: Record<string, any>;
  columnHeaders?: string[];
  createdBy?: { name: string; email: string };
  updatedBy?: { name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

interface UserPermission {
  _id: string;
  name: string;
  email: string;
  role: string;
  canManageApplications: boolean;
}

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [records, setRecords] = useState<ApplicationFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);

  // Arama & Filtreleme Durumları
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "empty">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [minNo, setMinNo] = useState("");
  const [maxNo, setMaxNo] = useState("");
  const [sortBy, setSortBy] = useState<
    "no_asc" | "no_desc" | "date_desc" | "date_asc" | "name_asc" | "name_desc"
  >("no_asc");
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);

  const [stats, setStats] = useState({
    totalCount: 0,
    emptyCount: 0,
    activeCount: 0,
    nextApplicationNo: 1,
  });

  // Modern Dialog State
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    details?: React.ReactNode;
    type: DialogType;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    secondaryAction?: {
      text: string;
      onClick: () => void;
      className?: string;
    };
  }>({
    isOpen: false,
    title: "",
    message: null,
    type: "question",
  });

  // Record Form Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ApplicationFileRecord | null>(null);
  const [targetEmptyFileId, setTargetEmptyFileId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    applicationNo: "",
    applicantName: "",
    tcNo: "",
    phone: "",
    address: "",
    fileStatus: "Aktif",
    notes: "",
  });

  // Excel Upload Modal State
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [customMapping, setCustomMapping] = useState({
    applicationNo: "",
    applicantName: "",
    tcNo: "",
    phone: "",
    address: "",
  });

  // Modern Excel Dışa Aktarma Modalı (Tüm Kullanıcılar İçin)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"filtered" | "all" | "active" | "empty">("filtered");
  const [exportInstitutionName, setExportInstitutionName] = useState(
    "T.C. SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI"
  );
  const [exportReportTitle, setExportReportTitle] = useState(
    "HANE VE BAŞVURU DOSYALARI CETVELİ"
  );

  // Permissions Modal State (Super Admin)
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [userList, setUserList] = useState<UserPermission[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const isSuperAdmin = session?.user?.role === "superadmin";

  // Load Records
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/application-files");
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setCanManage(Boolean(data.canManage));
        if (data.stats) {
          setStats(data.stats);
        }
      } else {
        toast.error("Dosya kayıtları yüklenemedi.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Sunucu ile bağlantı kurulamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchRecords();
    }
  }, [session]);

  // Load User Permissions
  const fetchUserPermissions = async () => {
    if (!isSuperAdmin) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/application-files/permissions");
      if (res.ok) {
        const data = await res.json();
        setUserList(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleUserPermission = async (userId: string, currentVal: boolean) => {
    try {
      const res = await fetch("/api/application-files/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, canManageApplications: !currentVal }),
      });
      if (res.ok) {
        toast.success("Yetki güncellendi.");
        setUserList((prev) =>
          prev.map((u) => (u._id === userId ? { ...u, canManageApplications: !currentVal } : u))
        );
      } else {
        const data = await res.json();
        toast.error(data.error || "Yetki güncellenemedi.");
      }
    } catch (e) {
      toast.error("Bir hata oluştu.");
    }
  };

  // ---------------------------------------------------------
  // GELİŞMİŞ FİLTRE TEMİZLEME
  // ---------------------------------------------------------
  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterTab("all");
    setStatusFilter("all");
    setDateStart("");
    setDateEnd("");
    setMinNo("");
    setMaxNo("");
    setSortBy("no_asc");
    toast.success("Filtreler sıfırlandı.");
  };

  const hasActiveFilters =
    searchTerm ||
    filterTab !== "all" ||
    statusFilter !== "all" ||
    dateStart ||
    dateEnd ||
    minNo ||
    maxNo ||
    sortBy !== "no_asc";

  // ---------------------------------------------------------
  // MANUEL KAYIT VE BOŞ DOSYA ÖNCELİK KONTROLÜ
  // ---------------------------------------------------------
  const handleStartManualCreate = async () => {
    try {
      const res = await fetch("/api/application-files/empty-files?limit=1");
      const data = await res.json();
      const emptyFile = data.firstEmptyFile;

      const nextRes = await fetch("/api/application-files/next-no");
      const nextData = await nextRes.json();
      const nextNo = nextData.nextNo || (stats.nextApplicationNo ? String(stats.nextApplicationNo) : "1");

      if (emptyFile) {
        setDialogState({
          isOpen: true,
          type: "question",
          title: "Boş Dosya Tespit Edildi",
          message: (
            <div>
              <p>
                Sistemde daha önce oluşturulmuş ancak adı soyadı girilmemiş <strong>boş bir dosya</strong> bulunmaktadır.
              </p>
              <div className="mt-3 p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-sm">
                <div className="font-semibold flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-amber-600" />
                  Mevcut Boş Dosya No: #{emptyFile.applicationNo}
                </div>
                {emptyFile.notes && <div className="text-xs text-amber-700 mt-1">Not: {emptyFile.notes}</div>}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Yeni bir numara (<strong>#{nextNo}</strong>) üretmek yerine bu boş dosyayı doldurmak ister misiniz?
              </p>
            </div>
          ),
          confirmText: `Evet, Boş Dosyaya (#${emptyFile.applicationNo}) Ekle`,
          cancelText: "Vazgeç",
          secondaryAction: {
            text: `Hayır, Yeni Numara İle (#${nextNo}) Oluştur`,
            className:
              "px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold transition-all shadow-md",
            onClick: () => {
              setDialogState((prev) => ({ ...prev, isOpen: false }));
              openFormModalForNew(nextNo);
            },
          },
          onConfirm: () => {
            setDialogState((prev) => ({ ...prev, isOpen: false }));
            openFormModalForEmpty(emptyFile);
          },
        });
      } else {
        openFormModalForNew(nextNo);
      }
    } catch (e) {
      console.error(e);
      openFormModalForNew(String(stats.nextApplicationNo));
    }
  };

  const openFormModalForNew = (assignedNo: string) => {
    setEditingRecord(null);
    setTargetEmptyFileId(null);
    setFormData({
      applicationNo: assignedNo,
      applicantName: "",
      tcNo: "",
      phone: "",
      address: "",
      fileStatus: "Aktif",
      notes: "",
    });
    setIsFormModalOpen(true);
  };

  const openFormModalForEmpty = (emptyFile: ApplicationFileRecord) => {
    setEditingRecord(null);
    setTargetEmptyFileId(emptyFile._id);
    setFormData({
      applicationNo: emptyFile.applicationNo,
      applicantName: "",
      tcNo: emptyFile.tcNo || "",
      phone: emptyFile.phone || "",
      address: emptyFile.address || "",
      fileStatus: "Aktif",
      notes: emptyFile.notes || "",
    });
    setIsFormModalOpen(true);
  };

  const openFormModalForEdit = (record: ApplicationFileRecord) => {
    setEditingRecord(record);
    setTargetEmptyFileId(null);
    setFormData({
      applicationNo: record.applicationNo,
      applicantName: record.applicantName || "",
      tcNo: record.tcNo || "",
      phone: record.phone || "",
      address: record.address || "",
      fileStatus: record.fileStatus || "Aktif",
      notes: record.notes || "",
    });
    setIsFormModalOpen(true);
  };

  // Submit Record Form
  const handleSubmitRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.applicationNo.trim()) {
      toast.error("Lütfen Başvuru / Dosya Numarasını giriniz.");
      return;
    }

    try {
      if (editingRecord) {
        const res = await fetch(`/api/application-files/${editingRecord._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Güncelleme başarısız.");
        }
        toast.success("Dosya kaydı başarıyla güncellendi.");
      } else {
        const res = await fetch("/api/application-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            targetRecordId: targetEmptyFileId,
          }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Kayıt eklenemedi.");
        }
        toast.success(
          targetEmptyFileId ? "Boş dosya başarıyla dolduruldu." : "Yeni dosya kaydı başarıyla oluşturuldu."
        );
      }

      setIsFormModalOpen(false);
      fetchRecords();
    } catch (err: any) {
      toast.error(err.message || "Bir hata oluştu.");
    }
  };

  // Delete Record Confirmation
  const handleDeleteRecord = (record: ApplicationFileRecord) => {
    setDialogState({
      isOpen: true,
      type: "danger",
      title: "Dosya Kaydını Sil",
      message: (
        <span>
          <strong>#{record.applicationNo}</strong> nolu dosya kaydını ({record.applicantName || "Boş Dosya"}) silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
        </span>
      ),
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/application-files/${record._id}`, { method: "DELETE" });
          if (res.ok) {
            toast.success("Kayıt silindi.");
            setDialogState((prev) => ({ ...prev, isOpen: false }));
            fetchRecords();
          } else {
            const data = await res.json();
            toast.error(data.error || "Silinemedi.");
          }
        } catch (e) {
          toast.error("Bir hata oluştu.");
        }
      },
    });
  };

  // ---------------------------------------------------------
  // EXCEL DOSYASI OKUMA & İÇE AKTARMA (IMPORT)
  // ---------------------------------------------------------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!rawJson || rawJson.length === 0) {
          toast.error("Seçilen Excel dosyasında veri satırı bulunamadı.");
          return;
        }

        const cols = Object.keys(rawJson[0]);
        setDetectedColumns(cols);
        setParsedRows(rawJson);

        const mapping = {
          applicationNo:
            cols.find((c) =>
              /başvuru\s*no|basvuru\s*no|hane\s*no|dosya\s*no|sıra\s*no|sira\s*no|no/i.test(c)
            ) || cols[0] || "",
          applicantName:
            cols.find((c) =>
              /adı\s*soyadı|ad\s*soyad|adi\s*soyadi|adı|adi|müracaatçı|hak\s*sahibi|vatandaş/i.test(c)
            ) || "",
          tcNo: cols.find((c) => /t\.?c\.?\s*kimlik|tc\s*no|kimlik\s*no/i.test(c)) || "",
          phone: cols.find((c) => /telefon|cep|gsm|tel/i.test(c)) || "",
          address: cols.find((c) => /adres|ikametgah|mahalle/i.test(c)) || "",
        };

        setCustomMapping(mapping);
        setIsExcelModalOpen(true);
      } catch (err: any) {
        console.error(err);
        toast.error("Excel dosyası okunurken hata oluştu: " + err.message);
      }
    };

    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExecuteImport = async () => {
    if (!parsedRows.length) return;
    setUploadingExcel(true);

    try {
      const res = await fetch("/api/application-files/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: parsedRows,
          customMapping,
          updateExisting: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "İçe aktarma sırasında hata oluştu.");
      }

      setIsExcelModalOpen(false);
      fetchRecords();

      const sum = data.summary;
      setDialogState({
        isOpen: true,
        type: "success",
        title: "Excel Verileri Başarıyla Yüklendi!",
        message: (
          <div className="space-y-3">
            <p>Excel tablosundaki veriler sisteme başarıyla aktarılmıştır.</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-blue-50 text-blue-900 rounded-xl font-medium">
                Toplam Satır: <strong>{sum.totalProcessed}</strong>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-900 rounded-xl font-medium">
                Yeni Eklenen: <strong>{sum.insertedCount}</strong>
              </div>
              <div className="p-2.5 bg-purple-50 text-purple-900 rounded-xl font-medium">
                Güncellenen: <strong>{sum.updatedCount}</strong>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-900 rounded-xl font-medium">
                Boş Dosya: <strong>{sum.emptyFilesCount}</strong>
              </div>
            </div>
          </div>
        ),
        confirmText: "Tamam",
        onConfirm: () => setDialogState((prev) => ({ ...prev, isOpen: false })),
      });
    } catch (err: any) {
      toast.error(err.message || "Bir hata oluştu.");
    } finally {
      setUploadingExcel(false);
    }
  };

  // ---------------------------------------------------------
  // GELİŞMİŞ FİLTRELEME & ARAMA MOTORU (CLIENT-SIDE)
  // ---------------------------------------------------------
  const filteredRecords = records
    .filter((r) => {
      // 1. Genel arama (Ad Soyad, TC, No, Telefon, Adres, Not)
      if (searchTerm) {
        const matches =
          turkishIncludes(r.applicationNo, searchTerm) ||
          turkishIncludes(r.applicantName, searchTerm) ||
          turkishIncludes(r.tcNo, searchTerm) ||
          turkishIncludes(r.phone, searchTerm) ||
          turkishIncludes(r.address, searchTerm) ||
          turkishIncludes(r.notes || "", searchTerm);
        if (!matches) return false;
      }

      const isNameEmpty = !r.applicantName || r.applicantName.trim() === "";

      // 2. Tab filtresi
      if (filterTab === "active" && (isNameEmpty || r.fileStatus === "Boş Dosya")) return false;
      if (filterTab === "empty" && !isNameEmpty && r.fileStatus !== "Boş Dosya") return false;

      // 3. Durum filtresi
      if (statusFilter !== "all") {
        if (statusFilter === "Boş Dosya" && !isNameEmpty && r.fileStatus !== "Boş Dosya") return false;
        if (statusFilter === "Aktif" && (isNameEmpty || r.fileStatus !== "Aktif")) return false;
        if (statusFilter === "Pasif" && r.fileStatus !== "Pasif") return false;
        if (statusFilter === "Arşiv" && r.fileStatus !== "Arşiv") return false;
      }

      // 4. Numara Aralığı
      const seq = r.applicationNoSeq || parseInt(r.applicationNo.replace(/\D/g, ""), 10) || 0;
      if (minNo && seq < parseInt(minNo, 10)) return false;
      if (maxNo && seq > parseInt(maxNo, 10)) return false;

      // 5. Tarih Aralığı
      if (dateStart || dateEnd) {
        const d = new Date(r.createdAt);
        if (dateStart) {
          const start = new Date(dateStart);
          start.setHours(0, 0, 0, 0);
          if (d < start) return false;
        }
        if (dateEnd) {
          const end = new Date(dateEnd);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === "no_asc") return (a.applicationNoSeq || 0) - (b.applicationNoSeq || 0);
      if (sortBy === "no_desc") return (b.applicationNoSeq || 0) - (a.applicationNoSeq || 0);
      if (sortBy === "date_desc")
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "date_asc")
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "name_asc")
        return (a.applicantName || "").localeCompare(b.applicantName || "", "tr");
      if (sortBy === "name_desc")
        return (b.applicantName || "").localeCompare(a.applicantName || "", "tr");
      return 0;
    });

  // ---------------------------------------------------------
  // GÜZEL MODERN EXCEL ÇIKTISI (TÜM KULLANICILAR İÇİN)
  // ---------------------------------------------------------
  const executeExportExcel = () => {
    let datasetToExport = filteredRecords;

    if (exportScope === "all") {
      datasetToExport = records;
    } else if (exportScope === "active") {
      datasetToExport = records.filter(
        (r) => r.applicantName && r.applicantName.trim() !== "" && r.fileStatus !== "Boş Dosya"
      );
    } else if (exportScope === "empty") {
      datasetToExport = records.filter(
        (r) => !r.applicantName || r.applicantName.trim() === "" || r.fileStatus === "Boş Dosya"
      );
    }

    if (datasetToExport.length === 0) {
      toast.error("Dışa aktarılacak kayıt bulunamadı.");
      return;
    }

    const dateStr = new Date().toISOString().split("T")[0];
    const filterInfo =
      exportScope === "filtered"
        ? `Filtrelenmiş Liste (${datasetToExport.length} Kayıt)`
        : exportScope === "all"
        ? `Tüm Dosyalar (${datasetToExport.length} Kayıt)`
        : exportScope === "active"
        ? `Dolu Dosyalar (${datasetToExport.length} Kayıt)`
        : `Boş Dosyalar (${datasetToExport.length} Kayıt)`;

    exportStyledApplicationExcel(datasetToExport, `Hane_Basvuru_Dosyalari_${dateStr}`, {
      institutionName: exportInstitutionName,
      reportTitle: exportReportTitle,
      filterInfo,
    });

    setIsExportModalOpen(false);
    toast.success("Excel tablosu kurumsal standartlarda başarıyla indirildi.");
  };

  // Hızlı doğrudan Excel indirme (Mevcut filtrelenmiş liste için)
  const handleQuickExport = () => {
    if (filteredRecords.length === 0) {
      toast.error("İndirilecek kayıt bulunamadı.");
      return;
    }
    const dateStr = new Date().toISOString().split("T")[0];
    exportStyledApplicationExcel(filteredRecords, `Hane_Basvuru_Dosyalari_${dateStr}`, {
      institutionName: exportInstitutionName,
      reportTitle: exportReportTitle,
      filterInfo: `Filtrelenmiş Liste (${filteredRecords.length} Kayıt)`,
    });
    toast.success("Excel tablosu Türkçe karakter uyumlu ve antetli olarak indirildi.");
  };

  return (
    <div className="space-y-6">
      {/* Gizli Excel File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Modern Dialog Bileşeni */}
      <ModernConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
        title={dialogState.title}
        message={dialogState.message}
        details={dialogState.details}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        onConfirm={dialogState.onConfirm}
        secondaryAction={dialogState.secondaryAction}
      />

      {/* Üst Başlık & Butonlar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-500/20">
              <FolderOpen className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
                Hane ve Başvuru Dosyaları
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Gelişmiş arama ve filtreleme yapın, modern kurumsal Excel raporu alın ve otomatik numara ile kayıt ekleyin.
              </p>
            </div>
          </div>
        </div>

        {/* Aksiyon Butonları (Excel Çıktısı TÜM KULLANICILAR İÇİN Açık) */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {isSuperAdmin && (
            <button
              onClick={() => {
                fetchUserPermissions();
                setIsPermModalOpen(true);
              }}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-all shadow-sm"
              title="Kullanıcı Yetkilendirme"
            >
              <UserCheck className="w-4 h-4 text-slate-600" />
              Yetkili Kullanıcılar
            </button>
          )}

          {/* GÜZEL MODERN EXCEL ÇIKTISI BUTONU (TÜM KULLANICILAR İÇİN) */}
          <div className="flex items-center gap-1 flex-1 lg:flex-none">
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/25 active:scale-95"
              title="Güzel ve Modern Standartlarda Excel Raporu İndir"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel Çıktısı Al
            </button>
          </div>

          {canManage ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-600/20"
                title="Excel Dosyası Yükle (.xlsx, .xls)"
              >
                <UploadCloud className="w-4 h-4" />
                Excel Yükle
              </button>

              <button
                onClick={handleStartManualCreate}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/30"
              >
                <Plus className="w-4 h-4" />
                Manuel Kayıt Ekle
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              Görüntüleme Modu (Excel indirme ve arama serbesttir)
            </div>
          )}
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Toplam Dosya</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalCount}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dolu / Aktif Dosyalar</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.activeCount}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Boş Dosyalar</p>
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-black text-slate-800">{stats.emptyCount}</h3>
              {stats.emptyCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  Doldurulabilir
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sıradaki Otomatik No</p>
            <h3 className="text-2xl font-black text-purple-700">#{stats.nextApplicationNo}</h3>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* GELİŞMİŞ ARAMA VE FİLTRELEME PANELİ                       */}
      {/* ========================================================= */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        {/* Ana Arama Çubuğu & Hızlı Sekmeler */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-3">
          {/* Hızlı Filtre Sekmeleri */}
          <div className="flex items-center p-1 bg-slate-100 rounded-2xl w-full lg:w-auto">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                filterTab === "all"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tüm Dosyalar ({stats.totalCount})
            </button>
            <button
              onClick={() => setFilterTab("active")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                filterTab === "active"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Dolu Dosyalar ({stats.activeCount})
            </button>
            <button
              onClick={() => setFilterTab("empty")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterTab === "empty"
                  ? "bg-white text-amber-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Boş Dosyalar</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                {stats.emptyCount}
              </span>
            </button>
          </div>

          {/* Genel Arama Kutusu ve Detay Butonu */}
          <div className="flex items-center gap-2 w-full lg:w-auto flex-1 lg:max-w-xl justify-end">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Başvuru no, isim, TC, telefon veya adres ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)}
              className={`p-2.5 rounded-2xl border text-sm font-semibold transition-all flex items-center gap-1.5 flex-shrink-0 ${
                isAdvancedFilterOpen || hasActiveFilters
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
              title="Detaylı Filtreleri Aç / Kapat"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filtreler</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              )}
            </button>

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="p-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors flex-shrink-0"
                title="Tüm Filtreleri Temizle"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Genişletilmiş Filtre Seçenekleri Paneli */}
        {isAdvancedFilterOpen && (
          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Durum Filtresi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Dosya Durumu
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="Aktif">Sadece Aktif Dosyalar</option>
                <option value="Boş Dosya">Sadece Boş Dosyalar</option>
                <option value="Pasif">Pasif Dosyalar</option>
                <option value="Arşiv">Arşivlenmiş Dosyalar</option>
              </select>
            </div>

            {/* Başvuru No Min - Max Aralığı */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Başvuru No Aralığı
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="Min"
                  value={minNo}
                  onChange={(e) => setMinNo(e.target.value)}
                  className="w-1/2 px-2.5 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white font-mono"
                />
                <span className="text-slate-400 text-xs">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxNo}
                  onChange={(e) => setMaxNo(e.target.value)}
                  className="w-1/2 px-2.5 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white font-mono"
                />
              </div>
            </div>

            {/* Kayıt Başlangıç Tarihi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Kayıt Başlangıç
              </label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
              />
            </div>

            {/* Kayıt Bitiş Tarihi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Kayıt Bitiş
              </label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
              />
            </div>

            {/* Sıralama */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Sıralama Ölçütü
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="no_asc">Başvuru No: 1 → 9 (Küçükten Büyüğe)</option>
                <option value="no_desc">Başvuru No: 9 → 1 (Büyükten Küçüğe)</option>
                <option value="date_desc">Kayıt Tarihi: En Yeniler Önce</option>
                <option value="date_asc">Kayıt Tarihi: En Eskiler Önce</option>
                <option value="name_asc">İsim: A → Z</option>
                <option value="name_desc">İsim: Z → A</option>
              </select>
            </div>
          </div>
        )}

        {/* Canlı Sonuç Bildirimi & Filtre Özeti */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500 border-t border-slate-50">
          <div className="flex items-center gap-2">
            <span>
              Toplam <strong>{records.length}</strong> dosyadan{" "}
              <strong className="text-blue-700">{filteredRecords.length}</strong> tanesi listeleniyor.
            </span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                Filtreler Aktif
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleQuickExport}
              className="text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 hover:underline"
              title="Bu listeyi hemen Excel olarak indir"
            >
              <Download className="w-3.5 h-3.5" />
              Bu Listeyi Hızlı İndir (.xlsx)
            </button>
          </div>
        </div>
      </div>

      {/* Kayıt Tablosu */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100">
                <th className="py-4 px-5 font-bold text-slate-700 w-36">
                  <span className="flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-blue-600" />
                    Başvuru No
                  </span>
                </th>
                <th className="py-4 px-5 font-bold text-slate-700">Adı Soyadı</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-40">T.C. Kimlik No</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-36">Telefon</th>
                <th className="py-4 px-5 font-bold text-slate-700">Adres / Not</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-32">Durum</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-32">Kayıt Tarihi</th>
                {canManage && (
                  <th className="py-4 px-5 font-bold text-slate-700 text-right w-28">İşlemler</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      Dosyalar yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Aranan kriterlere uygun dosya kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const isEmpty = !record.applicantName || record.applicantName.trim() === "";

                  return (
                    <tr
                      key={record._id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isEmpty ? "bg-amber-50/30" : ""
                      }`}
                    >
                      {/* Başvuru No (Primary Key) */}
                      <td className="py-4 px-5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs">
                          #{record.applicationNo}
                        </span>
                      </td>

                      {/* Adı Soyadı */}
                      <td className="py-4 px-5 font-semibold">
                        {isEmpty ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200/60">
                              Boş Dosya
                            </span>
                            {canManage && (
                              <button
                                onClick={() => openFormModalForEmpty(record)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-bold underline flex items-center gap-0.5"
                              >
                                Doldur <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-800">{record.applicantName}</span>
                        )}
                      </td>

                      {/* TC Kimlik No */}
                      <td className="py-4 px-5 font-mono text-xs text-slate-600">
                        {record.tcNo || "-"}
                      </td>

                      {/* Telefon */}
                      <td className="py-4 px-5 text-xs text-slate-600 whitespace-nowrap">
                        {record.phone ? (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {record.phone}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>

                      {/* Adres / Not */}
                      <td className="py-4 px-5 text-xs text-slate-600 max-w-xs truncate">
                        {record.address && <span>{record.address}</span>}
                        {record.notes && (
                          <span className="text-slate-400 block text-[11px] italic truncate">
                            Not: {record.notes}
                          </span>
                        )}
                        {!record.address && !record.notes && "-"}
                      </td>

                      {/* Durum */}
                      <td className="py-4 px-5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isEmpty
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : record.fileStatus === "Pasif"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {isEmpty ? "Boş Dosya" : record.fileStatus || "Aktif"}
                        </span>
                      </td>

                      {/* Tarih */}
                      <td className="py-4 px-5 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(record.createdAt).toLocaleDateString("tr-TR")}
                      </td>

                      {/* İşlemler */}
                      {canManage && (
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openFormModalForEdit(record)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(record)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* GÜZEL MODERN EXCEL ÇIKTISI MODALI (TÜM KULLANICILAR İÇİN)  */}
      {/* ========================================================= */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsExportModalOpen(false)}
          />

          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Kurumsal Standartta Excel Raporu Al
                  </h3>
                  <p className="text-xs text-slate-500">
                    Başlık, otomatik sütun genişlikleri ve özet satırları ile modern Excel tablosu oluşturun.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Kapsam Seçimi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Dışa Aktarılacak Dosya Kapsamı
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setExportScope("filtered")}
                    className={`p-3 rounded-2xl border text-left font-semibold transition-all ${
                      exportScope === "filtered"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Filtrelenmiş Liste</span>
                      {exportScope === "filtered" && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Ekranda görünen {filteredRecords.length} dosya
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope("all")}
                    className={`p-3 rounded-2xl border text-left font-semibold transition-all ${
                      exportScope === "all"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Tüm Kayıtlar</span>
                      {exportScope === "all" && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Sistemdeki tüm {records.length} dosya
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope("active")}
                    className={`p-3 rounded-2xl border text-left font-semibold transition-all ${
                      exportScope === "active"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Sadece Dolu Dosyalar</span>
                      {exportScope === "active" && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <span className="text-[11px] text-slate-500 font-normal">
                      {stats.activeCount} aktif kişi dosyası
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope("empty")}
                    className={`p-3 rounded-2xl border text-left font-semibold transition-all ${
                      exportScope === "empty"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Sadece Boş Dosyalar</span>
                      {exportScope === "empty" && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <span className="text-[11px] text-slate-500 font-normal">
                      {stats.emptyCount} doldurulabilir boş dosya
                    </span>
                  </button>
                </div>
              </div>

              {/* Kurumsal Başlık ve Antet Bilgisi */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Kurumsal Antet ve Başlık Bilgileri
                </label>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Kurum Adı (Excel Antet Satırı)
                  </label>
                  <input
                    type="text"
                    value={exportInstitutionName}
                    onChange={(e) => setExportInstitutionName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Cetvel / Belge Başlığı
                  </label>
                  <input
                    type="text"
                    value={exportReportTitle}
                    onChange={(e) => setExportReportTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Bilgilendirme Kutusu */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  Excel çıktısında Türkçe karakterler (ğ, Ş, ı, İ, ö, ü, ç) tam uyumludur. Sütun genişlikleri metin uzunluğuna göre otomatik hizalanır ve tablo sonuna özet icmal satırı eklenir.
                </span>
              </div>

              {/* Butonlar */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={executeExportExcel}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Excel Dosyasını İndir (.xlsx)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MANUEL KAYIT / DÜZENLEME MODALI                           */}
      {/* ========================================================= */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsFormModalOpen(false)}
          />

          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-2xl">
                  {editingRecord ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {editingRecord
                      ? "Dosya Kaydını Düzenle"
                      : targetEmptyFileId
                      ? "Boş Dosyayı Doldur"
                      : "Yeni Dosya Kaydı"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {targetEmptyFileId
                      ? `Boş olarak kayıtlı #${formData.applicationNo} nolu dosya dolduruluyor.`
                      : "Başvuru ve hane bilgilerini eksiksiz giriniz."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRecord} className="mt-5 space-y-4">
              {/* Başvuru No (Birincil Anahtar) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Başvuru / Hane / Dosya No (Birincil Anahtar)</span>
                  {!editingRecord && !targetEmptyFileId && (
                    <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                      Otomatik Sıradaki No
                    </span>
                  )}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Hash className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.applicationNo}
                    onChange={(e) => setFormData({ ...formData, applicationNo: e.target.value })}
                    placeholder="Örn: 104"
                    className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Adı Soyadı */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Adı Soyadı (Boş bırakılırsa "Boş Dosya" olarak kaydedilir)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <UserIcon className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={formData.applicantName}
                    onChange={(e) => setFormData({ ...formData, applicantName: e.target.value })}
                    placeholder="Örn: Fatma Demir (veya boş bırakınız)"
                    className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* TC Kimlik No ve Telefon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    T.C. Kimlik No
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.tcNo}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tcNo: e.target.value.replace(/\D/g, "").slice(0, 11),
                      })
                    }
                    placeholder="11 haneli TC"
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Telefon
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="05XX XXX XX XX"
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Adres */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Adres / Mahalle
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <MapPin className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Mahalle, Sokak, Kapı No"
                    className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Durum ve Açıklama */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Dosya Durumu
                  </label>
                  <select
                    value={formData.fileStatus}
                    onChange={(e) => setFormData({ ...formData, fileStatus: e.target.value })}
                    className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Boş Dosya">Boş Dosya</option>
                    <option value="Pasif">Pasif</option>
                    <option value="Arşiv">Arşiv</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Açıklama / Not
                  </label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Ek not veya açıklama"
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Alt Butonlar */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all shadow-md shadow-blue-600/20"
                >
                  {editingRecord
                    ? "Değişiklikleri Kaydet"
                    : targetEmptyFileId
                    ? "Boş Dosyayı Güncelle"
                    : "Kaydı Oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EXCEL YÜKLEME & EŞLEŞTİRME MODALI                         */}
      {/* ========================================================= */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !uploadingExcel && setIsExcelModalOpen(false)}
          />

          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-2xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Excel Dosyası İçe Aktarma</h3>
                  <p className="text-xs text-slate-500">
                    Dosya: <strong>{excelFileName}</strong> ({parsedRows.length} satır tespit edildi)
                  </p>
                </div>
              </div>
              <button
                disabled={uploadingExcel}
                onClick={() => setIsExcelModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="p-4 bg-indigo-50/70 border border-indigo-200/60 rounded-2xl text-xs text-indigo-900 leading-relaxed">
                <span className="font-bold block mb-1">Önemli Bilgilendirme:</span>
                Excel tablonuzdaki <strong>"Başvuru No"</strong> sütunu birincil anahtar (Primary Key) olarak işlenecektir. Sistemde adı soyadı boş olan kayıtlar otomatik olarak <strong>"Boş Dosya"</strong> olarak işaretlenecek ve manuel ekleme sırasında öncelikli olarak doldurulmak üzere önerilecektir.
              </div>

              {/* Sütun Eşleştirme Seçenekleri */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Başvuru / Hane / Dosya No Sütunu <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={customMapping.applicationNo}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, applicationNo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
                  >
                    <option value="">Seçiniz...</option>
                    {detectedColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Adı Soyadı Sütunu
                  </label>
                  <select
                    value={customMapping.applicantName}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, applicantName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
                  >
                    <option value="">Seçiniz (veya boş bırakınız)...</option>
                    {detectedColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    T.C. Kimlik No Sütunu
                  </label>
                  <select
                    value={customMapping.tcNo}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, tcNo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                  >
                    <option value="">(Otomatik veya yoksa atla)</option>
                    {detectedColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Telefon Sütunu
                  </label>
                  <select
                    value={customMapping.phone}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                  >
                    <option value="">(Yoksa atla)</option>
                    {detectedColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Önizleme Tablosu (İlk 3 Satır) */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">
                  Excel Önizlemesi (İlk 3 Satır):
                </p>
                <div className="border border-slate-200 rounded-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        {detectedColumns.slice(0, 5).map((col) => (
                          <th key={col} className="p-2.5 font-bold">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 3).map((r, i) => (
                        <tr key={i} className="bg-white">
                          {detectedColumns.slice(0, 5).map((col) => (
                            <td key={col} className="p-2.5 text-slate-600 truncate max-w-xs">
                              {String(r[col] || "-")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Butonlar */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={uploadingExcel}
                  onClick={() => setIsExcelModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={uploadingExcel}
                  onClick={handleExecuteImport}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2"
                >
                  {uploadingExcel ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Yükleniyor...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      {parsedRows.length} Kaydı Sisteme Yükle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* YETKİLENDİRME MODALI (SÜPER ADMİN)                        */}
      {/* ========================================================= */}
      {isPermModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsPermModalOpen(false)}
          />

          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-2xl">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Dosya İşlem Yetkilendirmesi</h3>
                  <p className="text-xs text-slate-500">
                    Süper Admin olarak, Excel yükleme ve manuel kayıt ekleme yetkisi verilecek kullanıcıları belirleyin.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPermModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-2.5 pr-1">
              {loadingUsers ? (
                <div className="py-8 text-center text-slate-500 text-sm">
                  Kullanıcılar yükleniyor...
                </div>
              ) : userList.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  Yetkilendirilebilecek personel veya müdür bulunamadı.
                </div>
              ) : (
                userList.map((u) => (
                  <div
                    key={u._id}
                    className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{u.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{u.email}</p>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          u.role === "manager"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {u.role === "manager" ? "Müdür" : "Personel"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleUserPermission(u._id, u.canManageApplications)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                        u.canManageApplications
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                          : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {u.canManageApplications ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Yetkili (Aktif)
                        </>
                      ) : (
                        "Yetki Ver"
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsPermModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
