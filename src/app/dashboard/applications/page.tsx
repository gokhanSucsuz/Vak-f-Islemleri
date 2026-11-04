"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  Users as UsersIcon,
  Heart,
  Archive,
  Clock,
} from "lucide-react";
import {
  turkishIncludes,
  cleanHeaderKey,
  exportStyledApplicationExcel,
  extractAndCleanTC,
  parseDateOrExtractDate,
  matchEdirneMahalleKoy,
} from "@/lib/turkish";
import ModernConfirmDialog, { DialogType } from "@/components/ModernConfirmDialog";

interface ApplicationFileRecord {
  _id: string;
  applicationNo: string;
  applicationNoSeq: number;
  sheetName?: string;
  applicantName: string;
  spouseName?: string;
  tcNo: string;
  spouseTcNo?: string;
  helpType?: string;
  neighborhood?: string;
  phone: string;
  address: string;
  fileStatus: string;
  applicationDate?: string | null;
  notes?: string;
  importBatchId?: string;
  importBatchName?: string;
  extraData?: Record<string, any>;
  columnHeaders?: string[];
  createdBy?: { name: string; email: string };
  updatedBy?: { name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

interface SheetTabInfo {
  name: string;
  count: number;
  columnHeaders: string[];
}

interface UserPermission {
  _id: string;
  name: string;
  email: string;
  role: string;
  canManageApplications: boolean;
}

interface ImportBatchInfo {
  _id: string;
  name: string;
  count: number;
  firstCreatedAt: string;
  lastCreatedAt: string;
}

/**
 * Sayfalama numaralarını mükerrerlik olmadan ardışık ve güvenli şekilde hesaplar
 */
function getPaginationPages(current: number, total: number, maxVisible = 5): number[] {
  if (total <= 0) return [1];
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  let start = current - Math.floor(maxVisible / 2);
  let end = current + Math.floor(maxVisible / 2);
  if (start < 1) {
    start = 1;
    end = maxVisible;
  }
  if (end > total) {
    end = total;
    start = total - maxVisible + 1;
  }
  const pages: number[] = [];
  for (let p = start; p <= end; p++) {
    pages.push(p);
  }
  return pages;
}

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Önbellek Sistemi (Cache): Hızlı ara-bul için istemci tarafı bellek önbelleği
  const cacheRef = useRef<
    Map<
      string,
      {
        records: ApplicationFileRecord[];
        pagination: { page: number; limit: number; totalRecords: number; totalPages: number };
        stats: { totalCount: number; emptyCount: number; activeCount: number; nextApplicationNo: number };
      }
    >
  >(new Map());

  const [records, setRecords] = useState<ApplicationFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);

  // Sekmeli Görünüm (Sheet Tabs) Durumları
  const [sheets, setSheets] = useState<SheetTabInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("all");
  const [activeTableColumns, setActiveTableColumns] = useState<string[]>([]);

  // Çoklu Excel Sekme Yükleme Durumları
  const [parsedSheets, setParsedSheets] = useState<{
    [key: string]: { rows: any[]; columns: string[] };
  }>({});
  const [sheetNamesList, setSheetNamesList] = useState<string[]>([]);
  const [activePreviewSheet, setActivePreviewSheet] = useState<string>("");
  const [selectedUploadSheets, setSelectedUploadSheets] = useState<{ [key: string]: boolean }>({});

  // Sayfalama (Pagination) Durumları
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Arama & Filtreleme Durumları
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "empty">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [minNo, setMinNo] = useState("");
  const [maxNo, setMaxNo] = useState("");
  // Varsayılan sıralama: Son kayıttan ilk kayıta doğru (no_desc)
  const [sortBy, setSortBy] = useState<
    "no_desc" | "no_asc" | "date_desc" | "date_asc" | "name_asc" | "name_desc"
  >("no_desc");
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
    onClose?: () => void;
    secondaryAction?: {
      text: string;
      onClick: () => void;
      className?: string;
    };
    isLoading?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: null,
    type: "question",
    isLoading: false,
  });

  // Record Form Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ApplicationFileRecord | null>(null);
  const [targetEmptyFileId, setTargetEmptyFileId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    applicationNo: "",
    applicantName: "",
    spouseName: "",
    tcNo: "",
    spouseTcNo: "",
    helpType: "",
    neighborhood: "",
    phone: "",
    address: "",
    applicationDate: "",
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
    spouseName: "",
    helpType: "",
    applicationDate: "",
    neighborhood: "",
    tcNo: "",
    phone: "",
    address: "",
  });

  // Excel Dosyalarını Yönet / Sil Modalı
  const [isBatchManageModalOpen, setIsBatchManageModalOpen] = useState(false);
  const [importBatches, setImportBatches] = useState<ImportBatchInfo[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Modern Excel Dışa Aktarma Modalı (Tüm Kullanıcılar İçin)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"page" | "filtered" | "all" | "active" | "empty">("filtered");
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

  // Önbellek Sıfırlama
  const invalidateCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  // Kayıtları Sunucudan veya Önbellekten Çekme
  const fetchRecords = useCallback(async (ignoreCache = false) => {
    const cacheKey = `${selectedSheet}_${currentPage}_${pageSize}_${filterTab}_${statusFilter}_${searchTerm.trim()}_${dateStart}_${dateEnd}_${minNo}_${maxNo}_${sortBy}`;

    // Önbellek kontrolü (Hemen Ara-Bul)
    if (!ignoreCache && cacheRef.current.has(cacheKey)) {
      const cached = cacheRef.current.get(cacheKey)!;
      setRecords(cached.records);
      setTotalPages(cached.pagination.totalPages);
      setTotalRecords(cached.pagination.totalRecords);
      setStats(cached.stats);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", String(currentPage));
      params.append("limit", String(pageSize));
      params.append("sortBy", sortBy);
      if (selectedSheet !== "all") params.append("sheet", selectedSheet);

      if (searchTerm.trim()) params.append("search", searchTerm.trim());
      if (filterTab !== "all") params.append("status", filterTab);
      else if (statusFilter !== "all") params.append("status", statusFilter);

      if (dateStart) params.append("dateStart", dateStart);
      if (dateEnd) params.append("dateEnd", dateEnd);

      const res = await fetch(`/api/application-files?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const recs = data.records || [];
        setRecords(recs);
        setCanManage(Boolean(data.canManage));

        if (data.sheets) {
          setSheets(data.sheets);
        }
        if (data.activeColumns && data.activeColumns.length > 0) {
          setActiveTableColumns(data.activeColumns);
        } else if (recs.length > 0) {
          const cols =
            recs[0].columnHeaders && recs[0].columnHeaders.length > 0
              ? recs[0].columnHeaders
              : recs[0].extraData
              ? Object.keys(recs[0].extraData)
              : [];
          if (cols.length > 0) setActiveTableColumns(cols);
        }

        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalRecords(data.pagination.totalRecords || 0);
        }
        if (data.stats) {
          setStats(data.stats);
        }

        // Önbelleğe kaydet
        cacheRef.current.set(cacheKey, {
          records: recs,
          pagination: data.pagination || { page: currentPage, limit: pageSize, totalRecords: recs.length, totalPages: 1 },
          stats: data.stats || stats,
        });
      } else {
        toast.error("Dosya kayıtları yüklenemedi.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Sunucu ile bağlantı kurulamadı.");
    } finally {
      setLoading(false);
    }
  }, [selectedSheet, currentPage, pageSize, filterTab, statusFilter, searchTerm, dateStart, dateEnd, minNo, maxNo, sortBy, stats]);

  // Sekme Seçimi Değiştiğinde
  const handleSelectSheet = (sName: string) => {
    setSelectedSheet(sName);
    setCurrentPage(1);
    if (sName !== "all") {
      const sObj = sheets.find((item) => item.name === sName);
      if (sObj && sObj.columnHeaders && sObj.columnHeaders.length > 0) {
        setActiveTableColumns(sObj.columnHeaders);
      }
    }
  };

  useEffect(() => {
    if (session) {
      fetchRecords();
    }
  }, [session, selectedSheet, currentPage, pageSize, filterTab, statusFilter, sortBy]);

  // Arama değiştiğinde 1. sayfaya dön
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  // İçe Aktarılan Excel Paketlerini Getir
  const fetchImportBatches = async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch("/api/application-files/import");
      if (res.ok) {
        const data = await res.json();
        setImportBatches(data.batches || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBatches(false);
    }
  };

  // Belirli bir Excel Yükleme Paketini Sil
  const handleDeleteBatch = (batch: ImportBatchInfo) => {
    // Katman çakışması veya arkada kalma olmaması için aktif modalı kapat
    setIsBatchManageModalOpen(false);

    setDialogState({
      isOpen: true,
      isLoading: false,
      type: "danger",
      title: "Excel Yükleme Paketini Sil",
      message: (
        <span>
          <strong>{batch.name || "Excel Paketi"}</strong> kapsamında yüklenmiş olan{" "}
          <strong>{batch.count} adet</strong> dosya kaydını sistemden silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
        </span>
      ),
      confirmText: "Evet, Paketi Sil",
      cancelText: "Vazgeç",
      onClose: () => {
        setDialogState((prev) => ({ ...prev, isOpen: false }));
        setIsBatchManageModalOpen(true);
      },
      onConfirm: async () => {
        setDialogState((prev) => ({ ...prev, isLoading: true }));
        try {
          const res = await fetch(`/api/application-files/import?batchId=${batch._id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (res.ok) {
            toast.success(data.message || "Excel paketi başarıyla silindi.");
            setDialogState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
            invalidateCache();
            fetchRecords(true);
            fetchImportBatches();
            setIsBatchManageModalOpen(true);
          } else {
            toast.error(data.error || "Silinemedi.");
            setDialogState((prev) => ({ ...prev, isLoading: false }));
            setIsBatchManageModalOpen(true);
          }
        } catch (e) {
          toast.error("Bir hata oluştu.");
          setDialogState((prev) => ({ ...prev, isLoading: false }));
          setIsBatchManageModalOpen(true);
        }
      },
    });
  };

  // Tüm Başvuru Dosyalarını Sıfırla (Süper Admin veya Yetkili Kullanıcı)
  const handleClearAllRecords = () => {
    // Katman çakışması veya arkada kalma olmaması için aktif modalı HEMEN kapat
    setIsBatchManageModalOpen(false);

    setDialogState({
      isOpen: true,
      isLoading: false,
      type: "danger",
      title: "DİKKAT: TÜM DOSYA VERİTABANINI SIFIRLA",
      message: (
        <div className="space-y-2">
          <p className="text-red-700 font-semibold text-base">
            Sistemde kayıtlı bulunan tüm ({stats.totalCount}) başvuru ve hane dosyası tamamen silinecektir!
          </p>
          <p className="text-xs text-slate-500">
            Bu işlem tüm geçmiş kayıtları ve sekmeleri kalıcı olarak temizler. Eski kayıtlar silindikten sonra yeni Excel dosyanızı sekmeleriyle birlikte sıfırdan rahatlıkla yükleyebilirsiniz.
          </p>
        </div>
      ),
      confirmText: "TÜM KAYITLARI SİL",
      cancelText: "İptal",
      onClose: () => {
        setDialogState((prev) => ({ ...prev, isOpen: false }));
        setIsBatchManageModalOpen(true);
      },
      onConfirm: async () => {
        setDialogState((prev) => ({ ...prev, isLoading: true }));
        try {
          const res = await fetch("/api/application-files/import?clearAll=true", {
            method: "DELETE",
          });
          const data = await res.json();
          if (res.ok) {
            toast.success(data.message || "Tüm dosya kayıtları silindi.");
            setDialogState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
            invalidateCache();
            setSelectedSheet("all");
            fetchRecords(true);
            fetchImportBatches();
          } else {
            toast.error(data.error || "Silinemedi.");
            setDialogState((prev) => ({ ...prev, isLoading: false }));
            setIsBatchManageModalOpen(true);
          }
        } catch (e) {
          toast.error("Bir hata oluştu.");
          setDialogState((prev) => ({ ...prev, isLoading: false }));
          setIsBatchManageModalOpen(true);
        }
      },
    });
  };

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

  // Filtre Sıfırlama
  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterTab("all");
    setStatusFilter("all");
    setDateStart("");
    setDateEnd("");
    setMinNo("");
    setMaxNo("");
    setSortBy("no_desc");
    setCurrentPage(1);
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
    sortBy !== "no_desc";

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
      spouseName: "",
      tcNo: "",
      spouseTcNo: "",
      helpType: "",
      neighborhood: "",
      phone: "",
      address: "",
      applicationDate: "",
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
      spouseName: emptyFile.spouseName || "",
      tcNo: emptyFile.tcNo || "",
      spouseTcNo: emptyFile.spouseTcNo || "",
      helpType: emptyFile.helpType || "",
      neighborhood: emptyFile.neighborhood || "",
      phone: emptyFile.phone || "",
      address: emptyFile.address || "",
      applicationDate: emptyFile.applicationDate ? new Date(emptyFile.applicationDate).toISOString().split("T")[0] : "",
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
      spouseName: record.spouseName || "",
      tcNo: record.tcNo || "",
      spouseTcNo: record.spouseTcNo || "",
      helpType: record.helpType || "",
      neighborhood: record.neighborhood || "",
      phone: record.phone || "",
      address: record.address || "",
      applicationDate: record.applicationDate ? new Date(record.applicationDate).toISOString().split("T")[0] : "",
      fileStatus: record.fileStatus || "Aktif",
      notes: record.notes || "",
    });
    setIsFormModalOpen(true);
  };

  // Kayıt Formunu Gönder
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
      invalidateCache();
      fetchRecords(true);
    } catch (err: any) {
      toast.error(err.message || "Bir hata oluştu.");
    }
  };

  // Tekil Kayıt Silme Onayı
  const handleDeleteRecord = (record: ApplicationFileRecord) => {
    setDialogState({
      isOpen: true,
      isLoading: false,
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
        setDialogState((prev) => ({ ...prev, isLoading: true }));
        try {
          const res = await fetch(`/api/application-files/${record._id}`, { method: "DELETE" });
          if (res.ok) {
            toast.success("Kayıt silindi.");
            setDialogState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
            invalidateCache();
            fetchRecords(true);
          } else {
            const data = await res.json();
            toast.error(data.error || "Silinemedi.");
            setDialogState((prev) => ({ ...prev, isLoading: false }));
          }
        } catch (e) {
          toast.error("Bir hata oluştu.");
          setDialogState((prev) => ({ ...prev, isLoading: false }));
        }
      },
    });
  };

  // ---------------------------------------------------------
  // EXCEL DOSYASI OKUMA & İÇE AKTARMA (IMPORT - ÇOKLU SEKME DESTEĞİ)
  // ---------------------------------------------------------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary", cellDates: true });
        const sheetNames = wb.SheetNames;

        if (!sheetNames || sheetNames.length === 0) {
          toast.error("Excel dosyasında sayfa bulunamadı.");
          return;
        }

        const allSheetsData: { [key: string]: { rows: any[]; columns: string[] } } = {};
        const checkboxes: { [key: string]: boolean } = {};
        let totalRows = 0;

        for (const sName of sheetNames) {
          const ws = wb.Sheets[sName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
          
          // Sadece geçerli sütunları al (En fazla 6 sütun, __EMPTY veya boş olanları tamamen hariç tut)
          const allRawCols = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
          const validCols = allRawCols
            .filter((c) => c && typeof c === "string" && !c.startsWith("__EMPTY") && c.trim() !== "")
            .slice(0, 6);

          // Mahalle/Köy ve Yardım Türü sütun başlıklarını tespit et
          const mahalleCol = validCols.find((c) => /mahalle|köy|koy|yerleşim/i.test(cleanHeaderKey(c))) || "MAHALLE/KÖY";
          const helpCol = validCols.find((c) => /yardım|yardim/i.test(cleanHeaderKey(c)));

          // Tamamen boş satırları ayıkla ve kaymış Edirne Mahalle/Köy kayıtlarını düzelt
          const cleanRows: any[] = [];
          for (const r of rawRows) {
            let hasData = false;
            const cleanRow: Record<string, any> = {};
            for (const col of validCols) {
              const val = r[col];
              cleanRow[col] = val !== undefined && val !== null ? val : "";
              if (String(cleanRow[col]).trim() !== "") {
                hasData = true;
              }
            }

            // KURAL: Eğer mahalle/köy sütunundaki değer boşsa veya geçerli bir Edirne mahalle/köy adı değilse;
            // bir sonraki sütunlardaki hücreleri kontrol et. Eğer Edirne mahalle/köy adı varsa o alana ekle;
            // mahalle veya köy adı dışında başka bir durum (örn: telefon, not vb.) var ise diğer sütunda o veri kalacak.
            const currentMahalleVal = cleanRow[mahalleCol];
            const directMahalleMatch = matchEdirneMahalleKoy(currentMahalleVal);

            if (directMahalleMatch) {
              cleanRow[mahalleCol] = directMahalleMatch;
            } else {
              // Satırdaki diğer hücrelerde (özellikle sonraki sütun / __EMPTY) Edirne mahalle/köyü var mı?
              let shiftedMahalle: string | null = null;
              for (const [key, cellVal] of Object.entries(r)) {
                if (key === mahalleCol) continue;
                const match = matchEdirneMahalleKoy(cellVal);
                if (match) {
                  shiftedMahalle = match;
                  break;
                }
              }

              if (shiftedMahalle) {
                // Eğer mahalle sütununda önceden başka bir veri varsa (örn: "GSS", "VERİ AKTARIMI")
                // ve yardım türü sütunu boşsa ya da sadece tarih içeriyorsa, bu veriyi yardım türüne koru:
                const prevStr = String(currentMahalleVal || "").trim();
                if (prevStr && helpCol && (!cleanRow[helpCol] || /^\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}$/.test(String(cleanRow[helpCol])))) {
                  cleanRow[helpCol] = prevStr;
                }
                cleanRow[mahalleCol] = shiftedMahalle;
                hasData = true;
              }
            }

            // Satırda en az bir alanda veri varsa listeye al, tamamen boşsa yok say
            if (hasData) {
              cleanRows.push(cleanRow);
            }
          }

          allSheetsData[sName] = { rows: cleanRows, columns: validCols };
          checkboxes[sName] = true;
          totalRows += cleanRows.length;
        }

        if (totalRows === 0) {
          toast.error("Seçilen Excel dosyasında veri satırı bulunamadı.");
          return;
        }

        const firstSheet = sheetNames[0];
        setParsedSheets(allSheetsData);
        setSheetNamesList(sheetNames);
        setSelectedUploadSheets(checkboxes);
        setActivePreviewSheet(firstSheet);
        setDetectedColumns(allSheetsData[firstSheet].columns);
        setParsedRows(allSheetsData[firstSheet].rows);

        const firstCols = allSheetsData[firstSheet].columns;

        // Otomatik sütun eşleştirmesi
        const mapping = {
          applicationNo:
            firstCols.find((c) =>
              /başvuru\s*no|basvuru\s*no|hane\s*no|dosya\s*no|sıra\s*no|sira\s*no|^no$/i.test(c.trim())
            ) || firstCols[0] || "",
          applicantName:
            firstCols.find((c) =>
              /adı\s*soyadı|ad\s*soyad|adi\s*soyadi|adı|adi|müracaatçı|hak\s*sahibi|vatandaş/i.test(c)
            ) || "",
          spouseName:
            firstCols.find((c) =>
              /eşinin\s*adı|eş\s*adı|es\s*adi|eş\s*soyadı|es\s*soyadi|eş|es/i.test(c)
            ) || "",
          helpType:
            firstCols.find((c) =>
              /yardım\s*türü|yardim\s*turu|başvuru\s*tarihi|yardım|yardim/i.test(c)
            ) || "",
          applicationDate:
            firstCols.find((c) =>
              /başvuru\s*tarihi|kayıt\s*tarihi|basvuru\s*tarihi|kayit\s*tarihi|tarih/i.test(c)
            ) || "",
          neighborhood:
            firstCols.find((c) =>
              /mahalle|köy|koy|yerleşim/i.test(cleanHeaderKey(c))
            ) || "",
          tcNo: firstCols.find((c) => /t\.?c\.?\s*kimlik|tc\s*no|kimlik\s*no/i.test(c)) || "",
          phone: firstCols.find((c) => /telefon|cep|gsm|tel/i.test(c)) || "",
          address: firstCols.find((c) => /adres|ikametgah/i.test(c)) || "",
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
    setUploadingExcel(true);

    try {
      // Seçili sekmeleri içe aktar
      const sheetsToImport = Object.keys(selectedUploadSheets)
        .filter((sName) => selectedUploadSheets[sName])
        .map((sName) => ({
          sheetName: sName,
          rows: parsedSheets[sName]?.rows || [],
          columnHeaders: parsedSheets[sName]?.columns || [],
        }));

      if (sheetsToImport.length === 0) {
        toast.error("Lütfen içe aktarılacak en az bir sekme seçiniz.");
        setUploadingExcel(false);
        return;
      }

      const res = await fetch("/api/application-files/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheets: sheetsToImport,
          customMapping,
          fileName: excelFileName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "İçe aktarma sırasında hata oluştu.");
      }

      setIsExcelModalOpen(false);
      invalidateCache();
      setSelectedSheet(sheetsToImport[0]?.sheetName || "all");
      fetchRecords(true);

      const sum = data.summary;
      setDialogState({
        isOpen: true,
        isLoading: false,
        type: "success",
        title: "Excel Verileri Başarıyla Yüklendi!",
        message: (
          <div className="space-y-3">
            <p className="text-slate-700 text-sm">
              Excel tablosundaki veriler orijinal sütun düzeni ve sekmeleriyle eksiksiz sisteme aktarılmıştır.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-blue-50 text-blue-900 rounded-xl font-medium">
                Toplam Satır: <strong>{sum.totalProcessed}</strong>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-900 rounded-xl font-medium">
                Yeni Eklenen: <strong>{sum.insertedCount}</strong>
              </div>
              <div className="p-2.5 bg-purple-50 text-purple-900 rounded-xl font-medium">
                Aktarılan Sekme: <strong>{sheetsToImport.length}</strong>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-900 rounded-xl font-medium">
                Boş Dosya: <strong>{sum.emptyFilesCount}</strong>
              </div>
            </div>
            {data.errors?.length > 0 && (
              <div className="p-3 bg-red-50 text-red-800 rounded-xl text-xs">
                <span className="font-semibold block mb-1">Uyarılar:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {data.errors.map((e: string, i: number) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
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
  // GÜZEL MODERN EXCEL ÇIKTISI (TÜM KULLANICILAR İÇİN)
  // ---------------------------------------------------------
  const executeExportExcel = async () => {
    let datasetToExport = records;

    if (exportScope === "page") {
      datasetToExport = records;
    } else {
      // Tüm verileri sunucudan çekip aktar
      try {
        const params = new URLSearchParams();
        params.append("all", "true");
        params.append("sortBy", sortBy);
        if (searchTerm.trim()) params.append("search", searchTerm.trim());

        if (exportScope === "active") params.append("status", "active");
        else if (exportScope === "empty") params.append("status", "empty");
        else if (filterTab !== "all") params.append("status", filterTab);
        else if (statusFilter !== "all") params.append("status", statusFilter);

        const res = await fetch(`/api/application-files?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          datasetToExport = data.records || [];
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (datasetToExport.length === 0) {
      toast.error("Dışa aktarılacak kayıt bulunamadı.");
      return;
    }

    const dateStr = new Date().toISOString().split("T")[0];
    const filterInfo =
      exportScope === "page"
        ? `Mevcut Sayfa Listesi (${datasetToExport.length} Kayıt)`
        : exportScope === "filtered"
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

  // Hızlı doğrudan Excel indirme
  const handleQuickExport = () => {
    if (records.length === 0) {
      toast.error("İndirilecek kayıt bulunamadı.");
      return;
    }
    const dateStr = new Date().toISOString().split("T")[0];
    exportStyledApplicationExcel(records, `Hane_Basvuru_Dosyalari_${dateStr}`, {
      institutionName: exportInstitutionName,
      reportTitle: exportReportTitle,
      filterInfo: `Mevcut Liste (${records.length} Kayıt)`,
    });
    toast.success("Excel tablosu Türkçe karakter uyumlu ve antetli olarak indirildi.");
  };

  // Aktif sekmenin veya yüklenen dosyanın orijinal sütunları (En fazla 6 sütun, __EMPTY tamamen hariç)
  const getTableColumns = (): string[] => {
    let cols: string[] = [];
    if (activeTableColumns && activeTableColumns.length > 0) {
      cols = activeTableColumns;
    } else if (records.length > 0) {
      if (records[0].columnHeaders && records[0].columnHeaders.length > 0) {
        cols = records[0].columnHeaders;
      } else if (records[0].extraData) {
        cols = Object.keys(records[0].extraData);
      }
    }
    if (cols.length === 0) {
      cols = [
        "Başvuru No",
        "Adı Soyadı",
        "Eşinin Adı Soyadı",
        "Yardım Türü",
        "Mahalle / Köy",
      ];
    }
    return cols
      .filter((c) => c && typeof c === "string" && !c.startsWith("__EMPTY") && c.trim() !== "")
      .slice(0, 6);
  };

  const tableColumns = getTableColumns();

  // Hücre içeriğini dinamik & düzeni bozmadan formatlama
  const renderCellContent = (col: string, record: ApplicationFileRecord) => {
    let val: any = undefined;

    // 1. extraData içinde doğrudan veya esnek anahtarla ara
    if (record.extraData) {
      if (record.extraData[col] !== undefined && String(record.extraData[col]).trim() !== "") {
        val = record.extraData[col];
      } else {
        const cleanCol = cleanHeaderKey(col);
        for (const [k, v] of Object.entries(record.extraData)) {
          if (cleanHeaderKey(k) === cleanCol && v !== undefined && v !== null && String(v).trim() !== "") {
            val = v;
            break;
          }
        }
      }
    }

    // 2. Standart model alanlarıyla eşleştir
    const cleanCol = cleanHeaderKey(col);

    // Mahalle / Köy kontrolü: Eğer modelde veya hücrede eşleşen geçerli Edirne mahalle/köyü varsa öncelikle onu kullan
    if (cleanCol.includes("mahalle") || cleanCol.includes("koy") || cleanCol.includes("yerlesim")) {
      const matchNeigh = matchEdirneMahalleKoy(record.neighborhood);
      const matchExtra = matchEdirneMahalleKoy(val);
      if (matchNeigh) {
        val = matchNeigh;
      } else if (matchExtra) {
        val = matchExtra;
      } else if (record.neighborhood) {
        val = record.neighborhood;
      }
    }

    if (val === undefined || val === null || String(val).trim() === "") {
      if (
        cleanCol.includes("basvuru") ||
        cleanCol.includes("dosya") ||
        cleanCol.includes("haneno") ||
        cleanCol === "no" ||
        cleanCol === "sirano" ||
        cleanCol === "sira"
      ) {
        val = record.applicationNo;
      } else if (
        cleanCol.includes("ad") &&
        cleanCol.includes("soyad") &&
        !cleanCol.includes("es")
      ) {
        val = record.applicantName;
      } else if (cleanCol.includes("es")) {
        val = record.spouseName;
      } else if (cleanCol.includes("tc") || cleanCol.includes("kimlik")) {
        val = record.tcNo;
      } else if (cleanCol.includes("yardim")) {
        val = record.helpType;
      } else if (cleanCol.includes("mahalle") || cleanCol.includes("koy") || cleanCol.includes("yerlesim")) {
        val = record.neighborhood;
      } else if (cleanCol.includes("tarih")) {
        val = record.applicationDate;
      } else if (cleanCol.includes("telefon") || cleanCol.includes("tel") || cleanCol.includes("gsm")) {
        val = record.phone;
      } else if (cleanCol.includes("adres")) {
        val = record.address;
      } else if (cleanCol.includes("durum")) {
        val = record.fileStatus;
      } else if (cleanCol.includes("not") || cleanCol.includes("aciklama")) {
        val = record.notes;
      }
    }

    if (val === undefined || val === null || String(val).trim() === "") {
      const norm = col.toLowerCase();
      if (
        (norm.includes("ad") ||
          norm.includes("müracaat") ||
          norm.includes("hak") ||
          norm.includes("vatandaş")) &&
        !norm.includes("eş") &&
        !norm.includes("es")
      ) {
        return (
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200/60">
              Boş Dosya
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => openFormModalForEmpty(record)}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline flex items-center gap-0.5"
              >
                Doldur
              </button>
            )}
          </div>
        );
      }
      return <span className="text-slate-300 font-mono">-</span>;
    }

    if (val instanceof Date) {
      return (
        <span className="text-slate-600 font-mono text-xs">
          {val.toLocaleDateString("tr-TR")}
        </span>
      );
    }
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return (
          <span className="text-slate-600 font-mono text-xs">
            {d.toLocaleDateString("tr-TR")}
          </span>
        );
      }
    }

    if (val === "Boş Dosya") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200/60">
          Boş Dosya
        </span>
      );
    } else if (val === "Aktif") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/60">
          Aktif
        </span>
      );
    }

    const normCol = col.toLowerCase();
    if (
      normCol.includes("başvuru") ||
      normCol.includes("dosya") ||
      normCol.includes("hane no")
    ) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 font-mono font-bold text-slate-800 text-xs">
          #{String(val)}
        </span>
      );
    }

    return <span className="text-slate-800 text-sm font-medium">{String(val)}</span>;
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
                Başvuru ve hane kayıtlarını yönetin, gelişmiş arama ve hızlı sayfalama yapın, kurumsal Excel raporu alın.
              </p>
            </div>
          </div>
        </div>

        {/* Aksiyon Butonları (Tüm Kullanıcılar İçin Excel İndirme Açık) */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Süper Admin: Yetkilendirme */}
          {isSuperAdmin && (
            <button
              onClick={() => {
                fetchUserPermissions();
                setIsPermModalOpen(true);
              }}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all shadow-sm"
              title="Kullanıcı Yetkilendirme"
            >
              <UserCheck className="w-4 h-4 text-slate-600" />
              Yetkili Kullanıcılar
            </button>
          )}

          {/* Excel Dosyalarını Yönet / Sil Butonu (Yetkili veya Süper Admin) */}
          {canManage && (
            <button
              onClick={() => {
                fetchImportBatches();
                setIsBatchManageModalOpen(true);
              }}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold transition-all border border-red-200"
              title="Yüklenen Excel Dosyalarını veya Paketleri Sil"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              Excel Dosyası Sil
            </button>
          )}

          {/* GÜZEL MODERN EXCEL ÇIKTISI BUTONU (TÜM KULLANICILAR İÇİN) */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/25 active:scale-95"
            title="Güzel ve Modern Standartlarda Excel Raporu İndir"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel Çıktısı Al
          </button>

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
      {/* GELİŞMİŞ ARAMA, FİLTRELEME VE ÖNBELLEK ÇUBUĞU              */}
      {/* ========================================================= */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-3">
          {/* Hızlı Filtre Sekmeleri */}
          <div className="flex items-center p-1 bg-slate-100 rounded-2xl w-full lg:w-auto">
            <button
              onClick={() => {
                setFilterTab("all");
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                filterTab === "all"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tüm Dosyalar ({stats.totalCount})
            </button>
            <button
              onClick={() => {
                setFilterTab("active");
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                filterTab === "active"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Dolu Dosyalar ({stats.activeCount})
            </button>
            <button
              onClick={() => {
                setFilterTab("empty");
                setCurrentPage(1);
              }}
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

          {/* Anlık Arama ve Gelişmiş Filtre Düğmesi */}
          <div className="flex items-center gap-2 w-full lg:w-auto flex-1 lg:max-w-xl justify-end">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Başvuru no, isim, eş, TC, mahalle veya yardım türü..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => handleSearchChange("")}
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
          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Durum Filtresi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Dosya Durumu
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="Aktif">Sadece Aktif Dosyalar</option>
                <option value="Boş Dosya">Sadece Boş Dosyalar</option>
                <option value="Pasif">Pasif Dosyalar</option>
                <option value="Arşiv">Arşivlenmiş Dosyalar</option>
              </select>
            </div>

            {/* Kayıt Başlangıç Tarihi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Başlangıç Tarihi
              </label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => {
                  setDateStart(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
              />
            </div>

            {/* Kayıt Bitiş Tarihi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Bitiş Tarihi
              </label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => {
                  setDateEnd(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
              />
            </div>

            {/* Sıralama (Varsayılan: Son Kayıttan İlk Kayıta) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Sıralama (Varsayılan: Son Kayıttan İlke)
              </label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-semibold"
              >
                <option value="no_desc">Başvuru No: Son Kayıttan İlke (9 → 1)</option>
                <option value="no_asc">Başvuru No: İlk Kayıttan Sona (1 → 9)</option>
                <option value="date_desc">Kayıt Tarihi: En Yeniler Önce</option>
                <option value="date_asc">Kayıt Tarihi: En Eskiler Önce</option>
                <option value="name_asc">İsim: A → Z</option>
                <option value="name_desc">İsim: Z → A</option>
              </select>
            </div>
          </div>
        )}

        {/* Canlı Sonuç Bildirimi & Sayfa Başına Kayıt Seçimi */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500 border-t border-slate-50">
          <div className="flex items-center gap-2">
            <span>
              Toplam <strong>{totalRecords}</strong> eşleşen kayıttan{" "}
              <strong>
                {totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{" "}
                {Math.min(currentPage * pageSize, totalRecords)}
              </strong>{" "}
              arası listeleniyor.
            </span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                Filtrelenmiş
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Sayfa Başına:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-slate-50 font-semibold"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <button
              onClick={handleQuickExport}
              className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 hover:underline"
              title="Bu listeyi hemen Excel olarak indir"
            >
              <Download className="w-3.5 h-3.5" />
              Hızlı Excel İndir (.xlsx)
            </button>
          </div>
        </div>
      </div>

      {/* EXCEL SEKME TABS (SEKMELİ GÖRÜNÜM) */}
      {sheets.length > 0 && (
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0">
              <Layers className="w-4 h-4 text-indigo-600" />
              Sekmeler:
            </span>
            <button
              type="button"
              onClick={() => handleSelectSheet("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                selectedSheet === "all"
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Tüm Sekmeler
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-200">
                {stats.totalCount}
              </span>
            </button>
            {sheets.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => handleSelectSheet(s.name)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  selectedSheet === s.name
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {s.name}
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    selectedSheet === s.name
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {s.count}
                </span>
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0 hidden md:block">
            {tableColumns.length} Sütun Görüntüleniyor
          </div>
        </div>
      )}

      {/* Kayıt Tablosu (Excel Sütunlarına Göre Dinamik & Bozulmayan Düzen) */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="py-3.5 px-4 font-bold text-slate-600 w-14 text-center text-xs">
                  #
                </th>
                {tableColumns.map((col) => (
                  <th
                    key={col}
                    className="py-3.5 px-4 font-bold text-slate-700 whitespace-nowrap text-left border-b border-slate-200 text-xs tracking-wider"
                  >
                    {col}
                  </th>
                ))}
                {canManage && (
                  <th className="py-3.5 px-4 font-bold text-slate-700 text-right whitespace-nowrap sticky right-0 bg-slate-50/95 backdrop-blur-sm z-10 w-24">
                    İşlemler
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={tableColumns.length + 2} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      Dosyalar yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length + 2} className="py-12 text-center text-slate-400">
                    Aranan kriterlere uygun dosya kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                records.map((record, idx) => {
                  const isEmpty = !record.applicantName || record.applicantName.trim() === "";

                  return (
                    <tr
                      key={record._id}
                      className={`hover:bg-indigo-50/20 transition-colors ${
                        isEmpty ? "bg-amber-50/30" : ""
                      }`}
                    >
                      {/* Sıra No */}
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-400 text-center whitespace-nowrap">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>

                      {/* Dinamik Excel Sütunları */}
                      {tableColumns.map((col) => (
                        <td key={col} className="py-3.5 px-4 whitespace-nowrap">
                          {renderCellContent(col, record)}
                        </td>
                      ))}

                      {/* İşlemler */}
                      {canManage && (
                        <td className="py-3.5 px-4 text-right whitespace-nowrap sticky right-0 bg-white/95 backdrop-blur-sm z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.03)]">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openFormModalForEdit(record)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
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

        {/* ========================================================= */}
        {/* SAYFALAMA KONTROLLERİ (PAGINATION)                         */}
        {/* ========================================================= */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50/50">
          <div className="text-xs text-slate-500 font-medium">
            Sayfa <strong>{currentPage}</strong> / <strong>{totalPages || 1}</strong>{" "}
            (Toplam {totalRecords} Kayıt)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1 || loading}
              className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 transition-colors"
              title="İlk Sayfa"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage <= 1 || loading}
              className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Önceki
            </button>

            {/* Sayfa Butonları */}
            <div className="flex items-center gap-1 px-1">
              {getPaginationPages(currentPage, totalPages).map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                    currentPage === pageNum
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1"
            >
              Sonraki
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages || loading}
              className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 transition-colors"
              title="Son Sayfa"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* YÜKLENEN EXCEL DOSYALARINI YÖNET & SİL MODALI              */}
      {/* ========================================================= */}
      {isBatchManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsBatchManageModalOpen(false)}
          />

          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-red-100 text-red-600 rounded-2xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Yüklenen Excel Dosyalarını Sil & Yönet
                  </h3>
                  <p className="text-xs text-slate-500">
                    Daha önce yüklenmiş olan Excel paketlerini görüntüleyin veya gerektiğinde geri alıp silin.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchManageModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
              {loadingBatches ? (
                <div className="py-8 text-center text-slate-500 text-sm">
                  Excel paketleri yükleniyor...
                </div>
              ) : importBatches.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                  Sistemde silinebilecek aktif Excel yükleme paketi kaydı bulunamadı.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {importBatches.map((batch) => (
                    <div
                      key={batch._id}
                      className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          <p className="font-bold text-slate-800 text-sm">
                            {batch.name || "Excel Yükleme Paketi"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span>
                            Toplam: <strong className="text-slate-700">{batch.count} Dosya</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Yüklenme:{" "}
                            {new Date(batch.firstCreatedAt).toLocaleDateString("tr-TR")}{" "}
                            {new Date(batch.firstCreatedAt).toLocaleTimeString("tr-TR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(batch)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-red-50 text-red-600 border border-red-200 transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Bu Paketi Sil
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Süper Admin veya Yetkili Kullanıcı: Tüm Veritabanını Temizleme Seçeneği */}
              {(isSuperAdmin || canManage) && (
                <div className="mt-6 p-4 bg-red-50/70 border border-red-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-red-900 text-sm">Tüm Dosya Kayıtlarını Sıfırla</h4>
                      <p className="text-xs text-red-700 mt-0.5">
                        Sistemdeki tüm ({stats.totalCount}) başvuru dosyasını tek seferde kalıcı olarak siler.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearAllRecords}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      Tümünü Temizle
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsBatchManageModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

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
                      Arama ve filtrelere uyan {totalRecords} dosya
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
                      Sistemdeki tüm {stats.totalCount} dosya
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
                  Excel tablosunda: Başvuru No, T.C. Kimlik No, Adı Soyadı, Eşinin Adı Soyadı, Yardım Türü, Kayıt / Başvuru Tarihi, Mahalle / Köy ve ek bilgiler kurumsal formatta yer alır.
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
      {/* Sütunlar: başvuru no, adı soyadı, eşinin adı soyadı,      */}
      {/* yardım türü veya başvuru tarihi, mahalle/köy              */}
      {/* ========================================================= */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsFormModalOpen(false)}
          />

          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
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

              {/* Adı Soyadı & TC Kimlik No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Adı Soyadı (Boşsa "Boş Dosya" olur)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <UserIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={formData.applicantName}
                      onChange={(e) => setFormData({ ...formData, applicantName: e.target.value })}
                      placeholder="Örn: Fatma Demir"
                      className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

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
                    placeholder="11 haneli T.C."
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Eşinin Adı Soyadı & Eş TC */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Eşinin Adı Soyadı
                  </label>
                  <input
                    type="text"
                    value={formData.spouseName}
                    onChange={(e) => setFormData({ ...formData, spouseName: e.target.value })}
                    placeholder="Örn: Mehmet Demir"
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Eşinin T.C. Kimlik No
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.spouseTcNo}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        spouseTcNo: e.target.value.replace(/\D/g, "").slice(0, 11),
                      })
                    }
                    placeholder="Eş T.C. (isteğe bağlı)"
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Yardım Türü ve Kayıt / Başvuru Tarihi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Yardım Türü
                  </label>
                  <input
                    type="text"
                    value={formData.helpType}
                    onChange={(e) => setFormData({ ...formData, helpType: e.target.value })}
                    placeholder="Örn: Gıda, Nakdi, Kömür..."
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Kayıt / Başvuru Tarihi (Boş bırakılabilir)
                  </label>
                  <input
                    type="date"
                    value={formData.applicationDate}
                    onChange={(e) => setFormData({ ...formData, applicationDate: e.target.value })}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Mahalle / Köy ve Telefon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Mahalle / Köy
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <MapPin className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={formData.neighborhood}
                      onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                      placeholder="Örn: Fatih Mahallesi"
                      className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Telefon
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Phone className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="05XX XXX XX XX"
                      className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
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
                    className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
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
                    placeholder="Ek açıklama"
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
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
              {/* ÇOKLU SEKME SEÇİCİ */}
              {sheetNamesList.length > 1 && (
                <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      Excel Sekmeleri ({sheetNamesList.length} Sekme Tespit Edildi):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = sheetNamesList.every((s) => selectedUploadSheets[s]);
                        const next: { [k: string]: boolean } = {};
                        sheetNamesList.forEach((s) => {
                          next[s] = !allSelected;
                        });
                        setSelectedUploadSheets(next);
                      }}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline"
                    >
                      {sheetNamesList.every((s) => selectedUploadSheets[s]) ? "Seçimi Kaldır" : "Tümünü Seç"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sheetNamesList.map((sName) => {
                      const isChecked = selectedUploadSheets[sName] !== false;
                      const rowCount = parsedSheets[sName]?.rows?.length || 0;
                      const isCurrent = activePreviewSheet === sName;
                      return (
                        <div
                          key={sName}
                          onClick={() => {
                            setActivePreviewSheet(sName);
                            setDetectedColumns(parsedSheets[sName]?.columns || []);
                            setParsedRows(parsedSheets[sName]?.rows || []);
                          }}
                          className={`cursor-pointer px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                            isCurrent
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              setSelectedUploadSheets((prev) => ({
                                ...prev,
                                [sName]: e.target.checked,
                              }));
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                          />
                          <span>{sName}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isCurrent ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {rowCount} satır
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="p-4 bg-indigo-50/70 border border-indigo-200/60 rounded-2xl text-xs text-indigo-900 leading-relaxed space-y-1">
                <span className="font-bold block">Otomatik Dönüştürme Kuralları:</span>
                <p>• <strong>Başvuru No:</strong> Birincil anahtar (Primary Key) olarak kaydedilir.</p>
                <p>• <strong>Ad Soyad T.C. Kontrolü:</strong> Adı soyadı içinde T.C. kimlik numarası varsa otomatik ayıklanır ve isim temizlenir.</p>
                <p>• <strong>Tarih & Yardım Türü:</strong> Tarih alanı yok ise veya yardım türü sütununda tarih var ise kayıt tarihi o yapılır. Herhangi bir tarih yok ise tarih alanı boş bırakılır.</p>
                <p>• <strong>Boş Dosyalar:</strong> Adı soyadı boş olan kayıtlar otomatik olarak "Boş Dosya" olarak işaretlenir.</p>
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
                    Eşinin Adı Soyadı Sütunu
                  </label>
                  <select
                    value={customMapping.spouseName}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, spouseName: e.target.value })
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Yardım Türü veya Başvuru Tarihi
                  </label>
                  <select
                    value={customMapping.helpType}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, helpType: e.target.value })
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mahalle / Köy Sütunu
                  </label>
                  <select
                    value={customMapping.neighborhood}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, neighborhood: e.target.value })
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ayrı T.C. Kimlik No Sütunu
                  </label>
                  <select
                    value={customMapping.tcNo}
                    onChange={(e) =>
                      setCustomMapping({ ...customMapping, tcNo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                  >
                    <option value="">(İsimden otomatik ayıklanır veya ayrı seçin)</option>
                    {detectedColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Önizleme Tablosu */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">
                  Excel Önizlemesi (İlk 3 Satır):
                </p>
                <div className="border border-slate-200 rounded-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        {detectedColumns.slice(0, 6).map((col) => (
                          <th key={col} className="p-2.5 font-bold">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 3).map((r, i) => (
                        <tr key={i} className="bg-white">
                          {detectedColumns.slice(0, 6).map((col) => (
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
                      {parsedRows.length} Kaydı Güvenli Yükle
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

      {/* Modern Dialog Bileşeni - En son render edilerek tüm pencerelerin ve modalların üstünde kalması garanti altına alındı */}
      <ModernConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={() => {
          if (dialogState.onClose) dialogState.onClose();
          else setDialogState((prev) => ({ ...prev, isOpen: false }));
        }}
        title={dialogState.title}
        message={dialogState.message}
        details={dialogState.details}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        onConfirm={dialogState.onConfirm}
        secondaryAction={dialogState.secondaryAction}
        isLoading={dialogState.isLoading}
      />
    </div>
  );
}
