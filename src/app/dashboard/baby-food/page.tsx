"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Baby,
  Package,
  Users,
  Activity,
  Settings,
  X,
  Calendar,
  Filter,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Printer,
  Sparkles,
} from "lucide-react";
import { turkishIncludes, extractTC, exportToExcel } from "@/lib/turkish";
import ModernConfirmDialog, { DialogType } from "@/components/ModernConfirmDialog";

type BabyFoodType = {
  _id: string;
  brand: string;
  weight: string;
};

type BabyFoodItem = {
  brand: string;
  foodName: string;
  weight: string;
  quantity: number;
};

type BabyFoodRecord = {
  _id: string;
  tcNo?: string;
  motherInfo: string;
  receiver: string;
  babyName: string;
  deliveryDate?: string;
  items: BabyFoodItem[];
  createdBy: { _id: string; name: string };
  createdAt: string;
};

export default function BabyFoodPage() {
  const { data: session } = useSession();
  const [records, setRecords] = useState<BabyFoodRecord[]>([]);
  const [foodTypes, setFoodTypes] = useState<BabyFoodType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRecord, setEditingRecord] = useState<BabyFoodRecord | null>(null);

  // Mamaların Tür ve Numaralarına Göre Dağılımı - Aşağı Açılır Menü (Varsayılan: KAPALI)
  const [isDistributionOpen, setIsDistributionOpen] = useState(false);

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
  }>({
    isOpen: false,
    title: "",
    message: null,
    type: "question",
  });

  // Resmi Kurum PDF / Yazdırma Modalı
  const [isOfficialPdfModalOpen, setIsOfficialPdfModalOpen] = useState(false);
  const [pdfDateStart, setPdfDateStart] = useState("");
  const [pdfDateEnd, setPdfDateEnd] = useState("");
  const [institutionName, setInstitutionName] = useState(
    "T.C. SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI"
  );
  const [documentTitle, setDocumentTitle] = useState(
    "BEBEK MAMASI TESLİM TUTANAĞI VE DAĞITIM LİSTESİ"
  );
  const [officerName, setOfficerName] = useState("");
  const [managerName, setManagerName] = useState("Vakıf Müdürü");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const [formData, setFormData] = useState({
    tcNo: "",
    motherInfo: "",
    receiver: "",
    babyName: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    items: [] as BabyFoodItem[],
  });

  const [recentWarning, setRecentWarning] = useState<any | null>(null);
  const [checkingRecent, setCheckingRecent] = useState(false);

  const [newTypeData, setNewTypeData] = useState({
    brand: "",
    weight: "",
  });

  const [currentItem, setCurrentItem] = useState({
    typeId: "",
    foodName: "",
    quantity: 1,
  });

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const userRole = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;

  useEffect(() => {
    if (session?.user?.name && !officerName) {
      setOfficerName(session.user.name);
    }
  }, [session, officerName]);

  const fetchRecords = async () => {
    try {
      const params = new URLSearchParams();
      if (dateStart) params.append("dateStart", new Date(dateStart).toISOString());
      if (dateEnd) {
        const endDate = new Date(dateEnd);
        endDate.setHours(23, 59, 59, 999);
        params.append("dateEnd", endDate.toISOString());
      }

      const res = await fetch(`/api/baby-food?${params.toString()}`);
      if (!res.ok) throw new Error("Veriler alınamadı");
      const data = await res.json();
      setRecords(data);
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const fetchFoodTypes = async () => {
    try {
      const res = await fetch("/api/baby-food-types");
      if (res.ok) {
        const data = await res.json();
        setFoodTypes(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (session) {
      fetchRecords();
      fetchFoodTypes();
    }
  }, [session]);

  const checkRecentDelivery = async (tc: string) => {
    const cleanTc = tc?.trim();
    if (!cleanTc || cleanTc.length !== 11 || !/^\d{11}$/.test(cleanTc)) {
      setRecentWarning(null);
      return;
    }

    setCheckingRecent(true);
    try {
      const res = await fetch(`/api/baby-food/check-recent?tc=${cleanTc}`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasRecentDelivery) {
          setRecentWarning(data);
        } else {
          setRecentWarning(null);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingRecent(false);
    }
  };

  const handleTcChange = (val: string) => {
    const numeric = val.replace(/\D/g, "").slice(0, 11);
    setFormData((prev) => ({ ...prev, tcNo: numeric }));
    if (numeric.length === 11) {
      checkRecentDelivery(numeric);
    } else {
      setRecentWarning(null);
    }
  };

  const handleMotherInfoChange = (val: string) => {
    setFormData((prev) => ({ ...prev, motherInfo: val }));
    if (!formData.tcNo) {
      const extracted = extractTC(val);
      if (extracted && extracted.length === 11) {
        setFormData((prev) => ({ ...prev, tcNo: extracted }));
        checkRecentDelivery(extracted);
      }
    }
  };

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/baby-food-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTypeData),
      });
      if (!res.ok) throw new Error("Tanım eklenemedi");
      toast.success("Mama tanımı başarıyla eklendi");
      setNewTypeData({ brand: "", weight: "" });
      fetchFoodTypes();
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    }
  };

  const handleDeleteType = (id: string) => {
    setDialogState({
      isOpen: true,
      type: "danger",
      title: "Mama Tanımını Sil",
      message: "Bu mama tanımını silmek istediğinize emin misiniz?",
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/baby-food-types?id=${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Silme başarısız");
          toast.success("Tanım silindi");
          setDialogState((prev) => ({ ...prev, isOpen: false }));
          fetchFoodTypes();
        } catch (error: any) {
          toast.error(error.message || "Bir hata oluştu");
        }
      },
    });
  };

  const addItemToForm = () => {
    if (!currentItem.typeId) {
      toast.error("Lütfen bir mama markası seçin");
      return;
    }
    if (!currentItem.foodName) {
      toast.error("Lütfen numara/tür bilgisini girin");
      return;
    }
    const selectedType = foodTypes.find((t) => t._id === currentItem.typeId);
    if (!selectedType) return;

    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          brand: selectedType.brand,
          foodName: currentItem.foodName,
          weight: selectedType.weight,
          quantity: currentItem.quantity,
        },
      ],
    }));
    setCurrentItem({ typeId: "", foodName: "", quantity: 1 });
  };

  const removeItemFromForm = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.items.length === 0) {
      toast.error("Lütfen en az bir adet mama ekleyin");
      return;
    }

    // Son 30 gün içinde mama alınmışsa modern onay penceresi
    if (recentWarning && recentWarning.hasRecentDelivery) {
      setDialogState({
        isOpen: true,
        type: "warning",
        title: "DİKKAT: Son 30 Gün İçinde Teslimat Yapılmış!",
        message: (
          <div className="space-y-2">
            <p className="text-red-700 font-semibold">
              Bu T.C. Kimlik Numarasına son 30 gün içinde ({recentWarning.daysAgo} gün önce) bebek maması teslim edilmiştir!
            </p>
            <p className="text-xs text-slate-600">
              Mükerrer teslimatı önlemek için lütfen kontrol ediniz. Yine de yeni teslimat kaydı oluşturmak istiyor musunuz?
            </p>
          </div>
        ),
        confirmText: "Yine de Kaydet",
        cancelText: "Vazgeç",
        onConfirm: async () => {
          setDialogState((prev) => ({ ...prev, isOpen: false }));
          await executeSaveRecord();
        },
      });
      return;
    }

    await executeSaveRecord();
  };

  const executeSaveRecord = async () => {
    try {
      const payload = {
        ...formData,
        motherInfo:
          formData.tcNo && !formData.motherInfo.includes(formData.tcNo)
            ? `${formData.motherInfo.trim()} - ${formData.tcNo}`
            : formData.motherInfo.trim(),
      };

      if (editingRecord) {
        const res = await fetch("/api/baby-food", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, _id: editingRecord._id }),
        });
        if (!res.ok) throw new Error("Güncelleme başarısız");
        toast.success("Kayıt başarıyla güncellendi");
      } else {
        const res = await fetch("/api/baby-food", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Kayıt başarısız");
        toast.success("Kayıt başarıyla eklendi");
      }

      setIsModalOpen(false);
      setEditingRecord(null);
      resetForm();
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    }
  };

  const handleDelete = (id: string) => {
    setDialogState({
      isOpen: true,
      type: "danger",
      title: "Mama Kaydını Sil",
      message: "Bu teslimat kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/baby-food?id=${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Silme işlemi başarısız");
          toast.success("Kayıt başarıyla silindi");
          setDialogState((prev) => ({ ...prev, isOpen: false }));
          fetchRecords();
        } catch (error: any) {
          toast.error(error.message || "Bir hata oluştu");
        }
      },
    });
  };

  const resetForm = () => {
    setFormData({
      tcNo: "",
      motherInfo: "",
      receiver: "",
      babyName: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      items: [],
    });
    setCurrentItem({ typeId: "", foodName: "", quantity: 1 });
    setRecentWarning(null);
  };

  const openEditModal = (record: BabyFoodRecord) => {
    setEditingRecord(record);
    const tc = record.tcNo || extractTC(record.motherInfo) || "";
    const rawDate = record.deliveryDate || record.createdAt;
    const formattedDate = rawDate
      ? new Date(rawDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    setFormData({
      tcNo: tc,
      motherInfo: record.motherInfo,
      receiver: record.receiver || "",
      babyName: record.babyName,
      deliveryDate: formattedDate,
      items: record.items,
    });
    setRecentWarning(null);
    setIsModalOpen(true);
    if (tc) {
      checkRecentDelivery(tc);
    }
  };

  // Türkçe Karakter Uyumlu Anlık Arama Filtreleme (Yüksek Performans & Kesin Eşleşme)
  const filteredRecords = useMemo(() => {
    const cleanSearch = searchTerm.trim();
    if (!cleanSearch) return records;

    return records.filter((record) => {
      const itemsText = (record.items || [])
        .map((it) => `${it.brand || ""} ${it.foodName || ""}`)
        .join(" ");

      const combinedText = [
        record.tcNo,
        record.motherInfo,
        record.receiver,
        record.babyName,
        record.createdBy?.name,
        itemsText,
        record.deliveryDate ? new Date(record.deliveryDate).toLocaleDateString("tr-TR") : "",
      ]
        .filter(Boolean)
        .join(" ");

      return turkishIncludes(combinedText, cleanSearch);
    });
  }, [records, searchTerm]);

  const totalGiven = records.reduce(
    (acc, curr) => acc + curr.items.reduce((sum, item) => sum + item.quantity, 0),
    0
  );
  const uniqueFamilies = new Set(
    records.map((r) => r.tcNo || extractTC(r.motherInfo) || r.motherInfo)
  ).size;

  const detailedStats = records.reduce((acc, curr) => {
    curr.items.forEach((item) => {
      const key = `${item.brand} - ${item.foodName} (${item.weight})`;
      acc[key] = (acc[key] || 0) + item.quantity;
    });
    return acc;
  }, {} as Record<string, number>);

  const sortedDetailedStats = Object.entries(detailedStats).sort((a, b) => b[1] - a[1]);

  // Excel Dışa Aktarma
  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r, i) => {
      const tc = r.tcNo || extractTC(r.motherInfo) || "-";
      const itemsDetail = r.items
        .map((it) => `${it.quantity} adet ${it.brand} ${it.foodName} (${it.weight})`)
        .join("; ");
      const totalItemCount = r.items.reduce((sum, it) => sum + it.quantity, 0);

      return {
        "Sıra": i + 1,
        "Tarih": new Date(r.deliveryDate || r.createdAt).toLocaleDateString("tr-TR"),
        "TC Kimlik No": tc,
        "Anne Bilgisi": r.motherInfo,
        "Teslim Alan": r.receiver || "Kendisi",
        "Bebek Adı": r.babyName,
        "Teslim Edilen Mamalar": itemsDetail,
        "Toplam Miktar (Adet)": totalItemCount,
        "Teslim Eden Personel": r.createdBy?.name || "Bilinmiyor",
      };
    });

    const dateStr = new Date().toISOString().split("T")[0];
    exportToExcel(exportData, `Bebek_Mamasi_Teslim_Raporu_${dateStr}`, "Bebek Maması");
    toast.success("Excel raporu Türkçe karakter uyumlu olarak indirildi.");
  };

  // ---------------------------------------------------------
  // RESMİ KURUM STANDARTLARINDA PDF / ÇIKTI HAZIRLAMA
  // ---------------------------------------------------------
  const openOfficialPdfModal = () => {
    setPdfDateStart(dateStart || "");
    setPdfDateEnd(dateEnd || "");
    setIsOfficialPdfModalOpen(true);
  };

  // Belirtilen tarih aralığına göre filtrelenen kayıtlar
  const officialPdfRecords = records.filter((r) => {
    const itemDate = new Date(r.deliveryDate || r.createdAt);
    if (pdfDateStart) {
      const start = new Date(pdfDateStart);
      start.setHours(0, 0, 0, 0);
      if (itemDate < start) return false;
    }
    if (pdfDateEnd) {
      const end = new Date(pdfDateEnd);
      end.setHours(23, 59, 59, 999);
      if (itemDate > end) return false;
    }
    return true;
  });

  const pdfTotalFoodCount = officialPdfRecords.reduce(
    (acc, r) => acc + r.items.reduce((s, it) => s + it.quantity, 0),
    0
  );
  const pdfTotalFamilies = new Set(
    officialPdfRecords.map((r) => r.tcNo || extractTC(r.motherInfo) || r.motherInfo)
  ).size;

  // jsPDF ile doğrudan PDF indirme
  const handleDownloadDirectPDF = async () => {
    if (officialPdfRecords.length === 0) {
      toast.error("Belirtilen tarih aralığında kayıt bulunamadı.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      // Resmi Başlık
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("T.C.", 148, 13, { align: "center" });
      doc.setFontSize(11);
      doc.text(institutionName || "SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI", 148, 19, {
        align: "center",
      });
      doc.setFontSize(10);
      doc.text(documentTitle || "BEBEK MAMASI TESLİM VE DAĞITIM LİSTESİ", 148, 25, {
        align: "center",
      });

      // Tarih Aralığı & Bilgiler
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const dateRangeStr =
        pdfDateStart && pdfDateEnd
          ? `${new Date(pdfDateStart).toLocaleDateString("tr-TR")} - ${new Date(
              pdfDateEnd
            ).toLocaleDateString("tr-TR")} Tarihleri Arası`
          : "Tüm Tarihler";
      doc.text(`Tarih Aralığı: ${dateRangeStr}`, 14, 31);
      doc.text(
        `Düzenleme Tarihi: ${new Date().toLocaleDateString("tr-TR")} ${new Date().toLocaleTimeString(
          "tr-TR",
          { hour: "2-digit", minute: "2-digit" }
        )}`,
        282,
        31,
        { align: "right" }
      );

      // Tablo Satırları
      const tableData = officialPdfRecords.map((r, i) => {
        const tc = r.tcNo || extractTC(r.motherInfo) || "-";
        const itemsStr = r.items
          .map((it) => `${it.quantity}x ${it.brand} ${it.foodName} (${it.weight})`)
          .join(", ");
        const totalQty = r.items.reduce((sum, it) => sum + it.quantity, 0);

        return [
          i + 1,
          new Date(r.deliveryDate || r.createdAt).toLocaleDateString("tr-TR"),
          tc,
          r.motherInfo,
          r.babyName,
          r.receiver || "Kendisi",
          itemsStr,
          totalQty,
          r.createdBy?.name || "-",
          "", // Hak Sahibi İmza sütunu
        ];
      });

      autoTable(doc, {
        startY: 34,
        head: [
          [
            "Sıra",
            "Tarih",
            "T.C. Kimlik No",
            "Hak Sahibi (Anne)",
            "Bebek Adı",
            "Teslim Alan",
            "Teslim Edilen Mamalar",
            "Adet",
            "Teslim Eden",
            "İmza",
          ],
        ],
        body: tableData,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2, font: "helvetica" },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 18, halign: "center" },
          2: { cellWidth: 26, halign: "center" },
          3: { cellWidth: 40 },
          4: { cellWidth: 26 },
          5: { cellWidth: 26 },
          6: { cellWidth: 68 },
          7: { cellWidth: 12, halign: "center" },
          8: { cellWidth: 24 },
          9: { cellWidth: 18 },
        },
      });

      // İcmal ve İmza Alanı
      const lastY = (doc as any).lastAutoTable?.finalY || 150;
      let finalY = lastY + 8;
      if (finalY > 170) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(
        `İCMAL: Toplam Dağıtım: ${officialPdfRecords.length} Teslimat | Toplam Mama: ${pdfTotalFoodCount} Kutu/Adet | Faydalanan Aile: ${pdfTotalFamilies} Hane`,
        14,
        finalY
      );

      const signY = finalY + 12;
      doc.setFontSize(8.5);
      doc.text("Teslim Eden / Düzenleyen", 40, signY, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(officerName || session?.user?.name || "Personel", 40, signY + 5, {
        align: "center",
      });
      doc.text("İmza", 40, signY + 16, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.text("Onaylayan", 250, signY, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(managerName || "Vakıf Müdürü", 250, signY + 5, { align: "center" });
      doc.text("İmza - Mühür", 250, signY + 16, { align: "center" });

      const dateStr = new Date().toISOString().split("T")[0];
      doc.save(`Resmi_Bebek_Mamasi_Dagitim_Tutanagi_${dateStr}.pdf`);
      toast.success("Resmi Kurum PDF dosyası başarıyla indirildi.");
    } catch (err: any) {
      console.error(err);
      toast.error("PDF oluşturulurken hata oluştu: " + err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintOfficialView = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-0 print:bg-white">
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
      />

      {/* ========================================================= */}
      {/* SADECE YAZDIRMA (PRINT) ESNASINDA GÖRÜNEN RESMİ ANTETLİ TABLO */}
      {/* ========================================================= */}
      <div className="hidden print:block font-serif text-black p-4">
        <div className="text-center mb-6 border-b-2 border-black pb-4">
          <h2 className="text-xl font-bold tracking-wider">T.C.</h2>
          <h1 className="text-lg font-bold tracking-tight uppercase">{institutionName}</h1>
          <h3 className="text-base font-semibold mt-1 uppercase underline">{documentTitle}</h3>
          <div className="flex justify-between items-center text-xs mt-3 px-2 font-sans font-medium text-slate-800">
            <span>
              Tarih Aralığı:{" "}
              {pdfDateStart && pdfDateEnd
                ? `${new Date(pdfDateStart).toLocaleDateString("tr-TR")} - ${new Date(
                    pdfDateEnd
                  ).toLocaleDateString("tr-TR")}`
                : "Tüm Tarihler"}
            </span>
            <span>
              Düzenleme Tarihi: {new Date().toLocaleDateString("tr-TR")}{" "}
              {new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        <table className="w-full text-left border-collapse text-xs border border-black mb-6">
          <thead>
            <tr className="bg-slate-200 border-b border-black text-center font-bold">
              <th className="border border-black p-1.5 w-8">Sıra</th>
              <th className="border border-black p-1.5 w-20">Tarih</th>
              <th className="border border-black p-1.5 w-24">T.C. Kimlik No</th>
              <th className="border border-black p-1.5">Hak Sahibi (Anne)</th>
              <th className="border border-black p-1.5 w-24">Bebek Adı</th>
              <th className="border border-black p-1.5 w-24">Teslim Alan</th>
              <th className="border border-black p-1.5">Teslim Edilen Mamalar</th>
              <th className="border border-black p-1.5 w-12">Adet</th>
              <th className="border border-black p-1.5 w-24">Teslim Eden</th>
              <th className="border border-black p-1.5 w-20">İmza</th>
            </tr>
          </thead>
          <tbody>
            {officialPdfRecords.map((r, i) => {
              const tc = r.tcNo || extractTC(r.motherInfo) || "-";
              const itemsStr = r.items
                .map((it) => `${it.quantity}x ${it.brand} ${it.foodName} (${it.weight})`)
                .join(", ");
              const totalQty = r.items.reduce((sum, it) => sum + it.quantity, 0);

              return (
                <tr key={r._id} className="border-b border-black text-slate-900">
                  <td className="border border-black p-1.5 text-center font-mono">{i + 1}</td>
                  <td className="border border-black p-1.5 text-center font-mono">
                    {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="border border-black p-1.5 text-center font-mono">{tc}</td>
                  <td className="border border-black p-1.5 font-semibold">{r.motherInfo}</td>
                  <td className="border border-black p-1.5">{r.babyName}</td>
                  <td className="border border-black p-1.5">{r.receiver || "Kendisi"}</td>
                  <td className="border border-black p-1.5">{itemsStr}</td>
                  <td className="border border-black p-1.5 text-center font-bold">{totalQty}</td>
                  <td className="border border-black p-1.5">{r.createdBy?.name || "-"}</td>
                  <td className="border border-black p-1.5 text-center"></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* İcmal ve İmza Bloğu */}
        <div className="border border-black p-3 rounded bg-slate-50 text-xs mb-8">
          <span className="font-bold">GENEL İCMAL:</span> Toplam Dağıtım Kaydı:{" "}
          <strong>{officialPdfRecords.length}</strong> | Toplam Dağıtılan Mama Adedi:{" "}
          <strong>{pdfTotalFoodCount} Kutu</strong> | Faydalanan Aile Sayısı:{" "}
          <strong>{pdfTotalFamilies} Hane</strong>
        </div>

        <div className="grid grid-cols-2 gap-12 text-center text-xs mt-12 pt-4">
          <div>
            <p className="font-bold">Teslim Eden / Düzenleyen</p>
            <p className="mt-1">{officerName || session?.user?.name || "Vakıf Görevlisi"}</p>
            <div className="h-16 mt-2 flex items-center justify-center text-slate-400 italic">
              (İmza)
            </div>
          </div>
          <div>
            <p className="font-bold">Onaylayan</p>
            <p className="mt-1">{managerName || "Vakıf Müdürü"}</p>
            <div className="h-16 mt-2 flex items-center justify-center text-slate-400 italic">
              (İmza - Mühür)
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* EKRAN ARAYÜZÜ (PRINT ESNASINDA GİZLİ)                     */}
      {/* ========================================================= */}

      {/* Üst Başlık ve Aksiyon Alanı */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2.5">
            <div className="p-2.5 bg-pink-100 text-pink-600 rounded-2xl">
              <Baby className="w-7 h-7" />
            </div>
            Bebek Maması Takip Sistemi
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Ailelere teslim edilen bebek mamalarını yönetin, 30 gün kontrolü yapın ve resmi kurum standartlarında raporlayın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Resmi Kurum PDF / Yazdır Butonu */}
          <button
            onClick={openOfficialPdfModal}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-slate-900/20"
            title="Belirtilen Tarih Aralığında Resmi Kurum Standartlarında PDF Çıktısı Al"
          >
            <FileText className="w-4 h-4 text-pink-400" />
            Resmi Kurum PDF / Yazdır
          </button>

          {/* Excel İndir */}
          <button
            onClick={handleExportExcel}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-600/20"
            title="Türkçe Karakter Uyumlu Excel İndir"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel İndir
          </button>

          {(userRole === "manager" || userRole === "superadmin") && (
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
            >
              <Settings className="w-4 h-4" />
              Mama Türleri
            </button>
          )}

          <button
            onClick={() => {
              resetForm();
              setEditingRecord(null);
              setIsModalOpen(true);
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-pink-500/30"
          >
            <Plus className="w-4 h-4" />
            Yeni Mama Teslimi
          </button>
        </div>
      </div>

      {/* Tarih Filtreleme ve İstatistikler */}
      <div className="space-y-6 print:hidden">
        {/* Tarih Filtre Çubuğu */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-end gap-3">
          <div className="w-full md:w-auto flex-1">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Başlangıç Tarihi
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
              />
            </div>
          </div>

          <div className="w-full md:w-auto flex-1">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Bitiş Tarihi
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
              />
            </div>
          </div>

          <button
            onClick={fetchRecords}
            className="w-full md:w-auto flex items-center justify-center px-6 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors font-semibold text-sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtrele
          </button>
        </div>

        {/* Özet Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-pink-100 p-3.5 rounded-2xl text-pink-600">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Toplam Teslim Edilen Mama
              </p>
              <h3 className="text-2xl font-black text-slate-800">{totalGiven} Adet</h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-emerald-100 p-3.5 rounded-2xl text-emerald-600">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Ulaşılan Aile Sayısı
              </p>
              <h3 className="text-2xl font-black text-slate-800">{uniqueFamilies} Aile</h3>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* MAMALARIN TÜR VE NUMARALARINA GÖRE DAĞILIMI               */}
        {/* AŞAĞI AÇILIR MENÜ (ACCORDION / COLLAPSIBLE DROPDOWN)       */}
        {/* İlk başta sadece başlık görünür, tıklandığında açılır     */}
        {/* ========================================================= */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsDistributionOpen(!isDistributionOpen)}
            className="w-full p-5 bg-gradient-to-r from-slate-50 to-white hover:from-slate-100/70 hover:to-slate-50 transition-colors flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 text-purple-600 rounded-2xl group-hover:scale-105 transition-transform">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  Mamaların Tür ve Numaralarına Göre Dağılımı
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isDistributionOpen
                    ? "İçeriği daraltmak için tıklayınız"
                    : "Mamaların marka, numara ve kutu dağılımını aşağı açılır şekilde görüntülemek için tıklayınız"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="px-3 py-1 text-xs font-bold bg-pink-100 text-pink-700 rounded-full">
                {sortedDetailedStats.length} Çeşit Mama
              </span>
              <div className="p-1.5 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-slate-200 transition-colors">
                {isDistributionOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </div>
          </button>

          {/* Açılır Menü İçeriği */}
          {isDistributionOpen && (
            <div className="p-5 border-t border-slate-100 bg-white animate-in slide-in-from-top-2 duration-200">
              {sortedDetailedStats.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  Bu filtrede henüz mama dağıtım verisi bulunmuyor.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sortedDetailedStats.map(([name, count], index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-pink-200 hover:bg-pink-50/20 transition-all"
                    >
                      <span className="text-xs font-bold text-slate-700 truncate pr-2">
                        {name}
                      </span>
                      <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-black bg-pink-100 text-pink-700 rounded-xl">
                        {count} Adet
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Kayıt Tablosu */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden print:hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Anne Adı, TC veya Bebek Adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-sm font-medium text-slate-900"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="Aramayı Temizle"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Toplam <strong>{filteredRecords.length}</strong> kayıt listeleniyor
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100">
                <th className="py-4 px-5 font-bold text-slate-700">Anne / T.C. Kimlik No</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-36">Teslim Alan</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-36">Bebek Adı</th>
                <th className="py-4 px-5 font-bold text-slate-700">Mama Detayları</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-36">Personel</th>
                <th className="py-4 px-5 font-bold text-slate-700 w-28">Tarih</th>
                <th className="py-4 px-5 font-bold text-slate-700 text-right w-24">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                      Yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const displayTc = record.tcNo || extractTC(record.motherInfo);
                  return (
                    <tr key={record._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-bold text-slate-800">{record.motherInfo}</div>
                        {displayTc && (
                          <span className="inline-block mt-1 font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                            TC: {displayTc}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-xs text-slate-600">
                        {record.receiver ? (
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {record.receiver}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Kendisi</span>
                        )}
                      </td>
                      <td className="py-4 px-5 font-semibold text-slate-700 text-xs">
                        {record.babyName}
                      </td>
                      <td className="py-4 px-5">
                        <ul className="space-y-1">
                          {record.items.map((item, idx) => (
                            <li key={idx} className="text-xs">
                              <span className="font-bold text-pink-600">{item.quantity}x</span>{" "}
                              <span className="font-medium text-slate-800">{item.brand}</span>{" "}
                              <span className="text-slate-600">{item.foodName}</span>{" "}
                              <span className="text-slate-400">({item.weight})</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-4 px-5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                          {record.createdBy?.name || "Bilinmiyor"}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(record.deliveryDate || record.createdAt).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        {((userRole === "personnel" && record.createdBy?._id === userId) ||
                          userRole === "superadmin" ||
                          userRole === "manager") && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(record)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(record._id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* RESMİ KURUM STANDARTLARINDA PDF / ÇIKTI MODALI             */}
      {/* ========================================================= */}
      {isOfficialPdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsOfficialPdfModalOpen(false)}
          />

          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-slate-900 text-white rounded-2xl">
                  <FileText className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Resmi Kurum Standartlarında Rapor & PDF Çıktısı
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tarih aralığını belirleyin, resmi antet bilgilerini kontrol edin ve resmi kurum standartlarında PDF çıktısı alın.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOfficialPdfModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Tarih Aralığı Belirleme */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Rapor Tarih Aralığı
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Başlangıç Tarihi
                    </label>
                    <input
                      type="date"
                      value={pdfDateStart}
                      onChange={(e) => setPdfDateStart(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Bitiş Tarihi
                    </label>
                    <input
                      type="date"
                      value={pdfDateEnd}
                      onChange={(e) => setPdfDateEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
                          .toISOString()
                          .split("T")[0];
                        const today = now.toISOString().split("T")[0];
                        setPdfDateStart(firstDay);
                        setPdfDateEnd(today);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Bu Ay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                          .toISOString()
                          .split("T")[0];
                        const today = now.toISOString().split("T")[0];
                        setPdfDateStart(thirtyDaysAgo);
                        setPdfDateEnd(today);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Son 30 Gün
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPdfDateStart("");
                        setPdfDateEnd("");
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Tüm Zamanlar
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    Seçili aralıkta <strong>{officialPdfRecords.length}</strong> teslimat kaydı,{" "}
                    <strong>{pdfTotalFoodCount}</strong> kutu mama bulundu.
                  </span>
                  <span className="font-semibold text-pink-700">
                    {pdfTotalFamilies} Farklı Aile
                  </span>
                </div>
              </div>

              {/* Resmi Kurum Bilgileri */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. Resmi Başlık ve İmza Bilgileri
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Resmi Kurum Adı (Antet)
                    </label>
                    <input
                      type="text"
                      value={institutionName}
                      onChange={(e) => setInstitutionName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Belge Başlığı
                    </label>
                    <input
                      type="text"
                      value={documentTitle}
                      onChange={(e) => setDocumentTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Teslim Eden / Düzenleyen Adı Soyadı
                    </label>
                    <input
                      type="text"
                      value={officerName}
                      onChange={(e) => setOfficerName(e.target.value)}
                      placeholder="Personel Adı Soyadı"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Onaylayan Yetkili (Vakıf Müdürü)
                    </label>
                    <input
                      type="text"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      placeholder="Vakıf Müdürü"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Canlı Belge Önizlemesi */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">
                  3. Resmi A4 Belge Önizlemesi:
                </p>
                <div className="border border-slate-200 rounded-2xl p-5 bg-white shadow-inner font-serif text-[11px] text-slate-900 space-y-3">
                  <div className="text-center border-b pb-2">
                    <p className="font-bold text-xs">T.C.</p>
                    <p className="font-bold uppercase text-xs">{institutionName}</p>
                    <p className="font-semibold underline mt-0.5">{documentTitle}</p>
                    <div className="flex justify-between items-center text-[10px] font-sans text-slate-500 mt-2">
                      <span>
                        Tarih Aralığı:{" "}
                        {pdfDateStart && pdfDateEnd
                          ? `${new Date(pdfDateStart).toLocaleDateString("tr-TR")} - ${new Date(
                              pdfDateEnd
                            ).toLocaleDateString("tr-TR")}`
                          : "Tüm Tarihler"}
                      </span>
                      <span>
                        Düzenleme Tarihi: {new Date().toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto border rounded">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead className="bg-slate-100 border-b">
                        <tr>
                          <th className="p-1 border text-center">Sıra</th>
                          <th className="p-1 border">Tarih</th>
                          <th className="p-1 border">TC Kimlik No</th>
                          <th className="p-1 border">Hak Sahibi</th>
                          <th className="p-1 border">Bebek</th>
                          <th className="p-1 border">Mamalar</th>
                          <th className="p-1 border text-center">Adet</th>
                          <th className="p-1 border text-center">İmza</th>
                        </tr>
                      </thead>
                      <tbody>
                        {officialPdfRecords.slice(0, 5).map((r, i) => (
                          <tr key={i} className="border-b">
                            <td className="p-1 border text-center">{i + 1}</td>
                            <td className="p-1 border">
                              {new Date(r.deliveryDate || r.createdAt).toLocaleDateString("tr-TR")}
                            </td>
                            <td className="p-1 border font-mono">
                              {r.tcNo || extractTC(r.motherInfo) || "-"}
                            </td>
                            <td className="p-1 border">{r.motherInfo}</td>
                            <td className="p-1 border">{r.babyName}</td>
                            <td className="p-1 border">
                              {r.items
                                .map((it) => `${it.quantity}x ${it.brand} ${it.foodName}`)
                                .join(", ")}
                            </td>
                            <td className="p-1 border text-center font-bold">
                              {r.items.reduce((sum, it) => sum + it.quantity, 0)}
                            </td>
                            <td className="p-1 border text-center text-slate-300">İmza</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {officialPdfRecords.length > 5 && (
                    <p className="text-[10px] text-center text-slate-400 font-sans italic">
                      ... ve toplam {officialPdfRecords.length} adet kayıt resmi raporda tam liste halinde yer alacaktır.
                    </p>
                  )}

                  {/* İmzalar */}
                  <div className="grid grid-cols-2 gap-8 text-center pt-2 text-[10px] border-t">
                    <div>
                      <p className="font-bold">Teslim Eden / Düzenleyen</p>
                      <p>{officerName || "Personel"}</p>
                      <p className="text-slate-400 mt-2">(İmza)</p>
                    </div>
                    <div>
                      <p className="font-bold">Onaylayan</p>
                      <p>{managerName || "Vakıf Müdürü"}</p>
                      <p className="text-slate-400 mt-2">(İmza - Mühür)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Butonları */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setIsOfficialPdfModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Kapat
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handlePrintOfficialView}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold transition-all shadow-md flex items-center gap-2"
                >
                  <Printer className="w-4 h-4 text-slate-300" />
                  Resmi Format Yazdır / PDF Kaydet
                </button>

                <button
                  type="button"
                  disabled={isGeneratingPdf || officialPdfRecords.length === 0}
                  onClick={handleDownloadDirectPDF}
                  className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold transition-all shadow-lg shadow-pink-600/30 flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingPdf ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      PDF Hazırlanıyor...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Doğrudan PDF İndir (.pdf)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ana Kayıt Ekleme / Düzenleme Modalı */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md p-6 border-b border-slate-100 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Baby className="w-6 h-6 text-pink-500" />
                {editingRecord ? "Mama Kaydını Düzenle" : "Yeni Bebek Maması Teslimi"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Kişi Bilgileri */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Kişi Bilgileri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Teslim / Dağıtım Tarihi */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-pink-500" />
                        Teslim / Dağıtım Tarihi
                      </span>
                      <span className="text-[11px] font-normal text-slate-500">
                        (Varsayılan bugündür, önceki günlerde teslim ettiyseniz değiştirebilirsiniz)
                      </span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.deliveryDate}
                      onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-sm font-semibold text-slate-800 transition-all"
                    />
                  </div>

                  {/* T.C. Kimlik No Alanı */}
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>T.C. Kimlik Numarası (Anne / Hak Sahibi)</span>
                      {checkingRecent && (
                        <span className="text-xs text-blue-600 animate-pulse font-normal">
                          Kontrol ediliyor...
                        </span>
                      )}
                    </label>
                    <input
                      required
                      type="text"
                      maxLength={11}
                      placeholder="11 Haneli TC Giriniz"
                      value={formData.tcNo}
                      onChange={(e) => handleTcChange(e.target.value)}
                      className={`w-full px-4 py-2 bg-slate-50 border rounded-xl font-mono text-base focus:outline-none focus:ring-2 transition-all ${
                        recentWarning && recentWarning.hasRecentDelivery
                          ? "border-red-500 bg-red-50/50 text-red-900 focus:ring-red-500/30"
                          : "border-slate-200 focus:ring-pink-500/20 focus:border-pink-500"
                      }`}
                    />
                  </div>

                  {/* Anne Adı Soyadı */}
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-bold text-slate-700">Anne Adı Soyadı</label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: Ayşe Yılmaz"
                      value={formData.motherInfo}
                      onChange={(e) => handleMotherInfoChange(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-sm"
                    />
                  </div>

                  {/* KIRMIZI UYARI KUTUSU */}
                  {recentWarning && recentWarning.hasRecentDelivery && (
                    <div className="md:col-span-2 p-4 bg-red-50 border-2 border-red-500 rounded-2xl shadow-sm text-red-900 space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-red-600 text-white p-1.5 rounded-lg">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-red-700 text-sm">
                            UYARI: BU T.C. KİMLİK NUMARASINA SON 30 GÜN İÇİNDE MAMA VERİLMİŞTİR!
                          </h4>
                          <p className="text-xs text-red-600 font-medium">
                            Mükerrer veya erken teslimatı önlemek için lütfen önceki teslimat detayını inceleyiniz.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white/90 p-3 rounded-xl border border-red-200 text-xs space-y-1.5">
                        <div className="flex justify-between items-center border-b border-red-100 pb-1">
                          <span className="text-slate-600 font-medium">Son Teslim Tarihi:</span>
                          <span className="font-bold text-red-600">
                            {new Date(recentWarning.lastDeliveryDate).toLocaleDateString("tr-TR")}{" "}
                            ({recentWarning.daysAgo === 0 ? "Bugün verildi" : `${recentWarning.daysAgo} gün önce`})
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-red-100 pb-1">
                          <span className="text-slate-600 font-medium">Bebek Adı:</span>
                          <span className="font-semibold text-slate-800">
                            {recentWarning.latestRecord?.babyName || "-"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-red-100 pb-1">
                          <span className="text-slate-600 font-medium">Verilen Mamalar:</span>
                          <span className="font-semibold text-slate-800">
                            {recentWarning.latestRecord?.items
                              ?.map((it: any) => `${it.quantity}x ${it.brand} ${it.foodName}`)
                              .join(", ")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 font-medium">Teslim Eden:</span>
                          <span className="font-semibold text-slate-800">
                            {recentWarning.latestRecord?.personnelName || "Bilinmiyor"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.tcNo.length === 11 &&
                    !checkingRecent &&
                    (!recentWarning || !recentWarning.hasRecentDelivery) && (
                      <div className="md:col-span-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>Bu T.C. kimlik numarasına son 30 gün içinde mama kaydı bulunmuyor.</span>
                      </div>
                    )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Teslim Alan (Anne haricinde ise)
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: Baba, Anneanne..."
                      value={formData.receiver}
                      onChange={(e) => setFormData({ ...formData, receiver: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Bebek Adı</label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: Yusuf Hamza"
                      value={formData.babyName}
                      onChange={(e) => setFormData({ ...formData, babyName: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Mama Ekleme Bölümü */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Teslim Edilen Mamalar
                </h3>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-3 items-end">
                  <div className="space-y-1.5 flex-1 w-full">
                    <label className="text-xs font-bold text-slate-700">Marka ve Gramaj</label>
                    <select
                      value={currentItem.typeId}
                      onChange={(e) => setCurrentItem({ ...currentItem, typeId: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 text-sm"
                    >
                      <option value="">Seçiniz...</option>
                      {foodTypes.map((type) => (
                        <option key={type._id} value={type._id}>
                          {type.brand} ({type.weight})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 w-full md:w-44">
                    <label className="text-xs font-bold text-slate-700">Numara</label>
                    <select
                      value={currentItem.foodName}
                      onChange={(e) => setCurrentItem({ ...currentItem, foodName: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 text-sm"
                    >
                      <option value="">Seçiniz...</option>
                      <option value="1 Numara">1 Numara</option>
                      <option value="2 Numara">2 Numara</option>
                      <option value="3 Numara">3 Numara</option>
                      <option value="4 Numara">4 Numara</option>
                      <option value="5 Numara">5 Numara</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 w-full md:w-28">
                    <label className="text-xs font-bold text-slate-700">Adet</label>
                    <input
                      type="number"
                      min="1"
                      value={currentItem.quantity}
                      onChange={(e) =>
                        setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) || 1 })
                      }
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={addItemToForm}
                    className="w-full md:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Ekle
                  </button>
                </div>

                {formData.items.length > 0 && (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4 font-bold text-slate-700">Marka / Tür</th>
                          <th className="py-2.5 px-4 font-bold text-slate-700">Gramaj</th>
                          <th className="py-2.5 px-4 font-bold text-slate-700 w-24">Adet</th>
                          <th className="py-2.5 px-4 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.items.map((item, idx) => (
                          <tr key={idx} className="bg-white">
                            <td className="py-2.5 px-4 font-semibold text-slate-800">
                              {item.brand} {item.foodName}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600">{item.weight}</td>
                            <td className="py-2.5 px-4 font-bold text-pink-600">{item.quantity}</td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => removeItemFromForm(idx)}
                                className="text-red-500 hover:text-red-700 p-1 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold text-sm"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-white rounded-xl font-semibold text-sm bg-pink-500 hover:bg-pink-600 shadow-lg shadow-pink-500/30"
                >
                  {editingRecord ? "Güncelle" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mama Türleri Ayarları Modalı */}
      {isSettingsModalOpen && (userRole === "manager" || userRole === "superadmin") && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500" />
                Mama Türleri Ayarları
              </h2>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <form
                onSubmit={handleAddType}
                className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 shadow-sm"
              >
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Yeni Marka & Gramaj Ekle
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase">Marka</label>
                    <input
                      required
                      type="text"
                      placeholder="Aptamil"
                      value={newTypeData.brand}
                      onChange={(e) => setNewTypeData({ ...newTypeData, brand: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase">Gramaj</label>
                    <input
                      required
                      type="text"
                      placeholder="900gr"
                      value={newTypeData.weight}
                      onChange={(e) => setNewTypeData({ ...newTypeData, weight: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    Türü Sisteme Ekle
                  </button>
                </div>
              </form>

              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Mevcut Tanımlar
                </h3>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  {foodTypes.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      Henüz eklenmiş mama türü yok.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {foodTypes.map((type) => (
                        <li
                          key={type._id}
                          className="flex justify-between items-center p-3.5 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-pink-100 flex items-center justify-center text-pink-600">
                              <Package className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-xs">{type.brand}</p>
                              <p className="text-[11px] text-slate-400">{type.weight}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteType(type._id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
