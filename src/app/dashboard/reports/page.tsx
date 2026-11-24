"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Download,
  Filter,
  Search,
  Calendar,
  User as UserIcon,
  BarChart3,
  Trash2,
  Baby,
  Gift,
  FileText,
  FileSpreadsheet,
  Package,
  Users as UsersIcon,
  Presentation as PresentationIcon,
  FileCheck2,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { turkishIncludes, extractTC, exportToExcel } from "@/lib/turkish";
import { toLocalDateInputValue, toLocalDayStartISO, toLocalDayEndISO } from "@/lib/date";
import { registerTurkishFont } from "@/lib/pdfFont";
import PaginationControls from "@/components/PaginationControls";

type ReportTab = "transactions" | "petitions" | "presentations" | "babyFood" | "inKindAid";

export default function ReportsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<ReportTab>("transactions");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // --- TAB 1: VAKIF İŞLEMLERİ (TRANSACTIONS) ---
  const [transactions, setTransactions] = useState<any[]>([]);
  const [helpTypes, setHelpTypes] = useState<any[]>([]);
  const [txFilters, setTxFilters] = useState({
    userId: "",
    dateStart: "",
    dateEnd: "",
    search: "",
    helpType: "",
  });
  const [txChartData, setTxChartData] = useState<any[]>([]);
  const [txHelpTypeStats, setTxHelpTypeStats] = useState<{ name: string; count: number }[]>([]);

  // --- TAB 2: BEBEK MAMASI ---
  const [babyFoodRecords, setBabyFoodRecords] = useState<any[]>([]);
  const [babyFoodTypes, setBabyFoodTypes] = useState<any[]>([]);
  const [babyFoodFilters, setBabyFoodFilters] = useState({
    userId: "",
    dateStart: "",
    dateEnd: "",
    search: "",
    brand: "",
  });
  const [babyFoodChartData, setBabyFoodChartData] = useState<any[]>([]);
  const [babyFoodTypeStats, setBabyFoodTypeStats] = useState<{ name: string; count: number }[]>([]);

  // --- TAB 3: AYNİ YARDIM ---
  const [inKindRecords, setInKindRecords] = useState<any[]>([]);
  const [inKindTypes, setInKindTypes] = useState<any[]>([]);
  const [inKindFilters, setInKindFilters] = useState({
    userId: "",
    dateStart: "",
    dateEnd: "",
    search: "",
    aidType: "",
  });
  const [inKindChartData, setInKindChartData] = useState<any[]>([]);
  const [inKindTypeStats, setInKindTypeStats] = useState<{ name: string; count: number }[]>([]);

  // --- TAB 4: DİLEKÇELER ---
  const [petitionRecords, setPetitionRecords] = useState<any[]>([]);
  const [petitionFilters, setPetitionFilters] = useState({
    userId: "",
    type: "all",
    dateStart: "",
    dateEnd: "",
    search: "",
  });

  // --- TAB 5: SUNULAR ---
  const [presentationRecords, setPresentationRecords] = useState<any[]>([]);
  const [meetingList, setMeetingList] = useState<any[]>([]);
  const [presentationFilters, setPresentationFilters] = useState({
    userId: "",
    meetingId: "",
    dateStart: "",
    dateEnd: "",
    search: "",
  });

  // Sayfalama Durumları (Tüm Sekmeler)
  const [txPage, setTxPage] = useState(1);
  const [bfPage, setBfPage] = useState(1);
  const [ikPage, setIkPage] = useState(1);
  const [petPage, setPetPage] = useState(1);
  const [presPage, setPresPage] = useState(1);
  const reportPageSize = 20;

  // Genel kullanıcı listesi ve başlangıç verileri
  useEffect(() => {
    fetchUsers();
    fetchHelpTypes();
    fetchBabyFoodTypes();
    fetchInKindTypes();
    fetchMeetings();
  }, []);

  useEffect(() => {
    if (activeTab === "transactions") {
      fetchTransactions();
    } else if (activeTab === "babyFood") {
      fetchBabyFood();
    } else if (activeTab === "inKindAid") {
      fetchInKindAid();
    } else if (activeTab === "petitions") {
      fetchPetitions();
    } else if (activeTab === "presentations") {
      fetchPresentations();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHelpTypes = async () => {
    try {
      const res = await fetch("/api/help-types");
      if (res.ok) {
        const data = await res.json();
        setHelpTypes(data.helpTypes || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBabyFoodTypes = async () => {
    try {
      const res = await fetch("/api/baby-food-types");
      if (res.ok) {
        const data = await res.json();
        setBabyFoodTypes(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInKindTypes = async () => {
    try {
      const res = await fetch("/api/in-kind-aid-types");
      if (res.ok) {
        const data = await res.json();
        setInKindTypes(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMeetings = async () => {
    try {
      const res = await fetch("/api/presentations/meetings");
      if (res.ok) {
        const data = await res.json();
        setMeetingList(data.meetings || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPetitions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "2000", page: "1" });
      if (petitionFilters.type !== "all") params.append("type", petitionFilters.type);
      const res = await fetch(`/api/petitions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPetitionRecords(data.petitions || []);
        setPetPage(1);
      }
    } catch {
      toast.error("Dilekçe verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchPresentations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (presentationFilters.meetingId) params.append("meetingId", presentationFilters.meetingId);
      const res = await fetch(`/api/presentations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPresentationRecords(data.presentations || []);
        setPresPage(1);
      }
    } catch {
      toast.error("Sunu verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Son 7 gün grafiği hesaplayıcı
  const generate7DayTimeline = (items: any[], dateField = "createdAt") => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = subDays(new Date(), i);
      return {
        dateString: format(d, "dd MMM", { locale: tr }),
        dateRaw: d,
        count: 0,
      };
    }).reverse();

    items.forEach((item) => {
      const rawDate = item[dateField] || item.createdAt;
      if (!rawDate) return;
      const itemDate = new Date(rawDate);
      const dateStr = format(itemDate, "dd MMM", { locale: tr });
      const found = last7Days.find((d) => d.dateString === dateStr);
      if (found) {
        found.count += 1;
      }
    });

    return last7Days;
  };

  // 1. VAKIF İŞLEMLERİ ÇEKME
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (txFilters.userId) params.append("userId", txFilters.userId);
      if (txFilters.search) params.append("search", txFilters.search);
      if (txFilters.helpType) params.append("helpType", txFilters.helpType);
      if (txFilters.dateStart) params.append("dateStart", toLocalDayStartISO(txFilters.dateStart));
      if (txFilters.dateEnd) params.append("dateEnd", toLocalDayEndISO(txFilters.dateEnd));

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const txList = data.transactions || [];
        setTransactions(txList);
        setTxChartData(generate7DayTimeline(txList));

        const typeCount: Record<string, number> = {};
        txList.forEach((t: any) => {
          const typeName = t.helpType?.name || "Belirtilmemiş";
          typeCount[typeName] = (typeCount[typeName] || 0) + 1;
        });
        const sortedTypes = Object.entries(typeCount)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        setTxHelpTypeStats(sortedTypes);
      }
    } catch (error) {
      toast.error("Vakıf işlemleri raporları yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // 2. BEBEK MAMASI ÇEKME
  const fetchBabyFood = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (babyFoodFilters.userId) params.append("userId", babyFoodFilters.userId);
      if (babyFoodFilters.brand) params.append("brand", babyFoodFilters.brand);
      if (babyFoodFilters.dateStart) params.append("dateStart", toLocalDayStartISO(babyFoodFilters.dateStart));
      if (babyFoodFilters.dateEnd) params.append("dateEnd", toLocalDayEndISO(babyFoodFilters.dateEnd));

      const res = await fetch(`/api/baby-food?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBabyFoodRecords(data || []);
        setBabyFoodChartData(generate7DayTimeline(data || [], "deliveryDate"));

        const brandCounts: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          r.items?.forEach((it: any) => {
            const label = `${it.brand} ${it.foodName} (${it.weight})`;
            brandCounts[label] = (brandCounts[label] || 0) + (it.quantity || 1);
          });
        });
        const sorted = Object.entries(brandCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        setBabyFoodTypeStats(sorted);
      }
    } catch (e) {
      toast.error("Bebek maması raporları yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // 3. AYNİ YARDIM ÇEKME
  const fetchInKindAid = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (inKindFilters.userId) params.append("userId", inKindFilters.userId);
      if (inKindFilters.aidType) params.append("aidType", inKindFilters.aidType);
      if (inKindFilters.dateStart) params.append("dateStart", toLocalDayStartISO(inKindFilters.dateStart));
      if (inKindFilters.dateEnd) params.append("dateEnd", toLocalDayEndISO(inKindFilters.dateEnd));

      const res = await fetch(`/api/in-kind-aid?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInKindRecords(data || []);
        setInKindChartData(generate7DayTimeline(data || [], "deliveryDate"));

        const typeCounts: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          r.items?.forEach((it: any) => {
            typeCounts[it.aidType] = (typeCounts[it.aidType] || 0) + (it.quantity || 1);
          });
        });
        const sorted = Object.entries(typeCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        setInKindTypeStats(sorted);
      }
    } catch (e) {
      toast.error("Ayni yardım raporları yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Silme işlemleri (Superadmin)
  const handleDeleteTx = async (id: string) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Kayıt silindi");
        fetchTransactions();
      }
    } catch (e) {
      toast.error("Hata oluştu");
    }
  };

  const handleDeleteAllTx = async () => {
    if (!confirm("Tüm işlem kayıtlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
    try {
      const res = await fetch("/api/transactions", { method: "DELETE" });
      if (res.ok) {
        toast.success("Tüm geçmiş silindi");
        fetchTransactions();
      }
    } catch (e) {
      toast.error("Hata oluştu");
    }
  };

  // --- TÜRKÇE KARAKTER UYUMLU FİLTRELEME & ARAMA ---
  const filteredTransactions = transactions.filter((t) =>
    turkishIncludes(t.citizenInfo, txFilters.search)
  );

  const filteredBabyFood = babyFoodRecords.filter(
    (r) =>
      (r.tcNo && turkishIncludes(r.tcNo, babyFoodFilters.search)) ||
      turkishIncludes(r.motherInfo, babyFoodFilters.search) ||
      (r.receiver && turkishIncludes(r.receiver, babyFoodFilters.search)) ||
      turkishIncludes(r.babyName, babyFoodFilters.search) ||
      r.items?.some(
        (it: any) =>
          turkishIncludes(it.brand, babyFoodFilters.search) ||
          turkishIncludes(it.foodName, babyFoodFilters.search)
      )
  );

  const filteredInKind = inKindRecords.filter(
    (r) =>
      (r.tcNo && turkishIncludes(r.tcNo, inKindFilters.search)) ||
      turkishIncludes(r.citizenName, inKindFilters.search) ||
      (r.receiver && turkishIncludes(r.receiver, inKindFilters.search)) ||
      (r.phone && turkishIncludes(r.phone, inKindFilters.search)) ||
      (r.address && turkishIncludes(r.address, inKindFilters.search)) ||
      r.items?.some(
        (it: any) =>
          turkishIncludes(it.aidType, inKindFilters.search) ||
          turkishIncludes(it.specification, inKindFilters.search)
      )
  );

  const filteredPetitions = useMemo(() => {
    const startMs = petitionFilters.dateStart
      ? new Date(toLocalDayStartISO(petitionFilters.dateStart)).getTime()
      : null;
    const endMs = petitionFilters.dateEnd
      ? new Date(toLocalDayEndISO(petitionFilters.dateEnd)).getTime()
      : null;

    return petitionRecords.filter((p) => {
      if (petitionFilters.userId && String(p.createdBy?._id || "") !== petitionFilters.userId) {
        return false;
      }
      if (petitionFilters.type !== "all" && p.petitionType !== petitionFilters.type) {
        return false;
      }
      const cMs = new Date(p.createdAt).getTime();
      if (startMs !== null && cMs < startMs) return false;
      if (endMs !== null && cMs > endMs) return false;

      if (petitionFilters.search.trim()) {
        const q = petitionFilters.search.trim();
        const combined = [p.citizenName, p.tcNo, p.subject, p.createdBy?.name]
          .filter(Boolean)
          .join(" ");
        if (!turkishIncludes(combined, q)) return false;
      }
      return true;
    });
  }, [petitionRecords, petitionFilters]);

  const filteredPresentations = useMemo(() => {
    const startMs = presentationFilters.dateStart
      ? new Date(toLocalDayStartISO(presentationFilters.dateStart)).getTime()
      : null;
    const endMs = presentationFilters.dateEnd
      ? new Date(toLocalDayEndISO(presentationFilters.dateEnd)).getTime()
      : null;

    return presentationRecords.filter((p) => {
      if (
        presentationFilters.userId &&
        String(p.createdBy?._id || "") !== presentationFilters.userId
      ) {
        return false;
      }
      if (
        presentationFilters.meetingId &&
        String(p.meetingId || "") !== presentationFilters.meetingId
      ) {
        return false;
      }
      const cMs = new Date(p.createdAt).getTime();
      if (startMs !== null && cMs < startMs) return false;
      if (endMs !== null && cMs > endMs) return false;

      if (presentationFilters.search.trim()) {
        const q = presentationFilters.search.trim();
        const combined = [p.summaryTitle, p.meetingTitle, p.createdBy?.name]
          .filter(Boolean)
          .join(" ");
        if (!turkishIncludes(combined, q)) return false;
      }
      return true;
    });
  }, [presentationRecords, presentationFilters]);

  const petitionStaffStats = useMemo(() => {
    const map: Record<string, { name: string; total: number; detayli: number; matbu: number }> = {};
    filteredPetitions.forEach((p) => {
      const name = p.createdBy?.name || "Bilinmiyor";
      if (!map[name]) map[name] = { name, total: 0, detayli: 0, matbu: 0 };
      map[name].total++;
      if (p.petitionType === "matbu") map[name].matbu++;
      else map[name].detayli++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredPetitions]);

  const presentationStaffStats = useMemo(() => {
    const map: Record<string, { name: string; count: number; slides: number; photos: number }> = {};
    filteredPresentations.forEach((p) => {
      const name = p.createdBy?.name || "Bilinmiyor";
      if (!map[name]) map[name] = { name, count: 0, slides: 0, photos: 0 };
      map[name].count++;
      map[name].slides += p.slideCount || 0;
      map[name].photos += p.totalPhotos || 0;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [filteredPresentations]);

  const txTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / reportPageSize));
  const paginatedTransactions = filteredTransactions.slice(
    (Math.min(txPage, txTotalPages) - 1) * reportPageSize,
    Math.min(txPage, txTotalPages) * reportPageSize
  );

  const bfTotalPages = Math.max(1, Math.ceil(filteredBabyFood.length / reportPageSize));
  const paginatedBabyFood = filteredBabyFood.slice(
    (Math.min(bfPage, bfTotalPages) - 1) * reportPageSize,
    Math.min(bfPage, bfTotalPages) * reportPageSize
  );

  const ikTotalPages = Math.max(1, Math.ceil(filteredInKind.length / reportPageSize));
  const paginatedInKind = filteredInKind.slice(
    (Math.min(ikPage, ikTotalPages) - 1) * reportPageSize,
    Math.min(ikPage, ikTotalPages) * reportPageSize
  );

  const petTotalPages = Math.max(1, Math.ceil(filteredPetitions.length / reportPageSize));
  const paginatedPetitions = filteredPetitions.slice(
    (Math.min(petPage, petTotalPages) - 1) * reportPageSize,
    Math.min(petPage, petTotalPages) * reportPageSize
  );

  const presTotalPages = Math.max(1, Math.ceil(filteredPresentations.length / reportPageSize));
  const paginatedPresentations = filteredPresentations.slice(
    (Math.min(presPage, presTotalPages) - 1) * reportPageSize,
    Math.min(presPage, presTotalPages) * reportPageSize
  );

  // --- EXCEL DIŞA AKTARMA (TÜRKÇE KARAKTER UYUMLU) ---
  const exportTxExcel = () => {
    const exportData = filteredTransactions.map((t, idx) => ({
      "Sıra": idx + 1,
      "Tarih": format(new Date(t.createdAt), "dd.MM.yyyy HH:mm"),
      "Personel": t.userId?.name || "-",
      "Vatandaş Bilgisi": t.citizenInfo,
      "Yardım Türü": t.helpType?.name || "Belirtilmemiş",
    }));
    exportToExcel(exportData, `Vakif_Islemleri_Raporu_${toLocalDateInputValue()}`, "İşlemler");
    toast.success("Vakıf İşlemleri raporu Türkçe karakter uyumlu Excel olarak indirildi.");
  };

  const exportBabyFoodExcel = () => {
    const exportData = filteredBabyFood.map((r, idx) => {
      const tc = r.tcNo || extractTC(r.motherInfo) || "-";
      const itemsDetail = r.items
        ?.map((it: any) => `${it.quantity} adet ${it.brand} ${it.foodName} (${it.weight})`)
        .join("; ");
      const totalQty = r.items?.reduce((s: number, it: any) => s + (it.quantity || 0), 0) || 0;

      return {
        "Sıra": idx + 1,
        "Tarih": format(new Date(r.deliveryDate || r.createdAt), "dd.MM.yyyy"),
        "TC Kimlik No": tc,
        "Anne Bilgisi": r.motherInfo,
        "Teslim Alan": r.receiver || "Kendisi",
        "Bebek Adı": r.babyName,
        "Teslim Edilen Mamalar": itemsDetail,
        "Toplam Adet": totalQty,
        "Personel": r.createdBy?.name || "Bilinmiyor",
      };
    });
    exportToExcel(exportData, `Bebek_Mamasi_Raporu_${toLocalDateInputValue()}`, "Bebek Maması");
    toast.success("Bebek Maması raporu Türkçe karakter uyumlu Excel olarak indirildi.");
  };

  const exportInKindExcel = () => {
    const exportData = filteredInKind.map((r, idx) => {
      const tc = r.tcNo || extractTC(r.citizenName) || "-";
      const itemsDetail = r.items
        ?.map((it: any) => `${it.quantity} ${it.unit} ${it.aidType}${it.specification ? ` (${it.specification})` : ""}`)
        .join("; ");
      const totalQty = r.items?.reduce((s: number, it: any) => s + (it.quantity || 0), 0) || 0;

      return {
        "Sıra": idx + 1,
        "Tarih": format(new Date(r.deliveryDate || r.createdAt), "dd.MM.yyyy"),
        "TC Kimlik No": tc,
        "Vatandaş Adı": r.citizenName,
        "Teslim Alan": r.receiver || "Kendisi",
        "Telefon": r.phone || "-",
        "Adres": r.address || "-",
        "Ayni Yardımlar": itemsDetail,
        "Toplam Miktar": totalQty,
        "Not": r.notes || "-",
        "Personel": r.createdBy?.name || "Bilinmiyor",
      };
    });
    exportToExcel(exportData, `Ayni_Yardim_Raporu_${toLocalDateInputValue()}`, "Ayni Yardım");
    toast.success("Ayni Yardım raporu Türkçe karakter uyumlu Excel olarak indirildi.");
  };

  const exportPetitionsExcel = () => {
    const exportData = filteredPetitions.map((p, idx) => ({
      "Sıra": idx + 1,
      "Tarih": format(new Date(p.createdAt), "dd.MM.yyyy HH:mm"),
      "Tür": p.petitionType === "matbu" ? "Matbu Dilekçe" : "Detaylı Dilekçe",
      "Vatandaş Adı Soyadı": p.citizenName,
      "T.C. Kimlik No": p.tcNo || "-",
      "Konu": p.subject || "-",
      "Hazırlayan Personel": p.createdBy?.name || "Bilinmiyor",
    }));
    exportToExcel(exportData, `Dilekce_Istatistik_Raporu_${toLocalDateInputValue()}`, "Dilekçeler");
    toast.success("Dilekçe İstatistik raporu Türkçe karakter uyumlu Excel olarak indirildi.");
  };

  const exportPresentationsExcel = () => {
    const exportData = filteredPresentations.map((p, idx) => ({
      "Sıra": idx + 1,
      "Tarih": format(new Date(p.createdAt), "dd.MM.yyyy HH:mm"),
      "Toplantı Dosyası": p.meetingTitle || "-",
      "Sunu Başlığı": p.summaryTitle || "-",
      "Slayt Sayısı": p.slideCount || 0,
      "Fotoğraf Sayısı": p.totalPhotos || 0,
      "Hazırlayan Personel": p.createdBy?.name || "Bilinmiyor",
    }));
    exportToExcel(exportData, `Sunu_Istatistik_Raporu_${toLocalDateInputValue()}`, "Sunular");
    toast.success("Sunu İstatistik raporu Türkçe karakter uyumlu Excel olarak indirildi.");
  };

  const exportPDF = async () => {
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const fontName = await registerTurkishFont(doc);

      const titleMap: Record<ReportTab, string> = {
        transactions: "VAKIF İŞLEMLERİ RESMİ İSTATİSTİK VE FAALİYET RAPORU",
        petitions: "DİLEKÇE İŞLEMLERİ RESMİ İSTATİSTİK RAPORU",
        presentations: "TOPLANTI SUNULARI RESMİ İSTATİSTİK RAPORU",
        babyFood: "BEBEK MAMASI TESLİMAT VE DAĞITIM RAPORU",
        inKindAid: "AYNİ YARDIM TESLİMAT VE DAĞITIM RAPORU",
      };

      doc.setFontSize(11);
      doc.text("T.C. EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI", 148.5, 14, {
        align: "center",
      });
      doc.setFontSize(13);
      doc.text(titleMap[activeTab], 148.5, 21, { align: "center" });
      doc.setFontSize(9);
      doc.text(
        `Rapor Tarihi: ${format(new Date(), "dd.MM.yyyy HH:mm")}   |   Düzenleyen: ${
          session?.user?.name || "Personel"
        }`,
        14,
        28
      );

      let head: string[][] = [];
      let body: (string | number)[][] = [];

      if (activeTab === "transactions") {
        head = [["Sıra", "Tarih / Saat", "Personel", "Vatandaş Bilgisi", "Yardım Türü"]];
        body = filteredTransactions.map((t, i) => [
          i + 1,
          format(new Date(t.createdAt), "dd.MM.yyyy HH:mm"),
          t.userId?.name || "-",
          t.citizenInfo || "-",
          t.helpType?.name || "-",
        ]);
      } else if (activeTab === "petitions") {
        head = [["Sıra", "Tarih", "Dilekçe Türü", "Adı Soyadı", "T.C. Kimlik No", "Konu", "Personel"]];
        body = filteredPetitions.map((p, i) => [
          i + 1,
          format(new Date(p.createdAt), "dd.MM.yyyy HH:mm"),
          p.petitionType === "matbu" ? "Matbu" : "Detaylı",
          p.citizenName || "-",
          p.tcNo || "-",
          p.subject || "-",
          p.createdBy?.name || "-",
        ]);
      } else if (activeTab === "presentations") {
        head = [["Sıra", "Tarih", "Toplantı", "Sunu Başlığı", "Slayt", "Fotoğraf", "Personel"]];
        body = filteredPresentations.map((p, i) => [
          i + 1,
          format(new Date(p.createdAt), "dd.MM.yyyy HH:mm"),
          p.meetingTitle || "-",
          p.summaryTitle || "-",
          p.slideCount || 0,
          p.totalPhotos || 0,
          p.createdBy?.name || "-",
        ]);
      } else if (activeTab === "babyFood") {
        head = [["Sıra", "Tarih", "Anne / T.C.", "Teslim Alan", "Bebek Adı", "Mamalar", "Personel"]];
        body = filteredBabyFood.map((r, i) => [
          i + 1,
          format(new Date(r.deliveryDate || r.createdAt), "dd.MM.yyyy"),
          `${r.motherInfo || "-"}${r.tcNo ? ` (${r.tcNo})` : ""}`,
          r.receiver || "Kendisi",
          r.babyName || "-",
          (r.items || []).map((it: any) => `${it.quantity}x ${it.brand} ${it.foodName}`).join(", "),
          r.createdBy?.name || "-",
        ]);
      } else {
        head = [["Sıra", "Tarih", "Vatandaş / T.C.", "Teslim Alan", "Yardımlar", "Not", "Personel"]];
        body = filteredInKind.map((r, i) => [
          i + 1,
          format(new Date(r.deliveryDate || r.createdAt), "dd.MM.yyyy"),
          `${r.citizenName || "-"}${r.tcNo ? ` (${r.tcNo})` : ""}`,
          r.receiver || "Kendisi",
          (r.items || []).map((it: any) => `${it.quantity} ${it.unit} ${it.aidType}`).join(", "),
          r.notes || "-",
          r.createdBy?.name || "-",
        ]);
      }

      autoTable(doc, {
        head,
        body,
        startY: 33,
        styles: {
          font: fontName,
          fontSize: 8.5,
          cellPadding: 2.5,
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      doc.save(`Edirne_SYDV_${activeTab}_${toLocalDateInputValue()}.pdf`);
      toast.success("Resmi kurum standartlarında Türkçe PDF indirildi.");
    } catch (err) {
      console.error(err);
      window.print();
    }
  };

  return (
    <div className="space-y-6 print:space-y-0 print:bg-white">
      {/* Üst Başlık & Sekme Seçimi */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-600" />
            Merkezi Raporlama ve İstatistik Paneli
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Vakıf işlemleri, Bebek Maması ve Ayni Yardım teslimatlarını detaylı filtreleyin, analiz edin ve Türkçe uyumlu Excel/PDF çıktısı alın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "transactions" && session?.user?.role === "superadmin" && (
            <button
              onClick={handleDeleteAllTx}
              className="h-10 inline-flex items-center justify-center px-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-sm"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Tüm Geçmişi Sil
            </button>
          )}

          <button
            onClick={
              activeTab === "transactions"
                ? exportTxExcel
                : activeTab === "petitions"
                ? exportPetitionsExcel
                : activeTab === "presentations"
                ? exportPresentationsExcel
                : activeTab === "babyFood"
                ? exportBabyFoodExcel
                : exportInKindExcel
            }
            className="h-10 inline-flex items-center justify-center px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-sm"
            title="Türkçe Karakter Uyumlu Excel İndir"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Excel İndir
          </button>

          <button
            onClick={exportPDF}
            className="h-10 inline-flex items-center justify-center px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Resmi PDF İndir
          </button>
        </div>
      </div>

      {/* Rapor Sekmeleri */}
      <div className="flex overflow-x-auto border-b border-slate-200 gap-1.5 print:hidden">
        <button
          onClick={() => setActiveTab("transactions")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "transactions"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <FileText className="w-4 h-4" />
          Vakıf İşlemleri
        </button>

        <button
          onClick={() => setActiveTab("petitions")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "petitions"
              ? "border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <FileCheck2 className="w-4 h-4 text-indigo-500" />
          Dilekçe İstatistikleri
        </button>

        <button
          onClick={() => setActiveTab("presentations")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "presentations"
              ? "border-violet-600 text-violet-600 bg-violet-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <PresentationIcon className="w-4 h-4 text-violet-500" />
          Sunu İstatistikleri
        </button>

        <button
          onClick={() => setActiveTab("babyFood")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "babyFood"
              ? "border-pink-500 text-pink-600 bg-pink-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <Baby className="w-4 h-4 text-pink-500" />
          Bebek Maması
        </button>

        <button
          onClick={() => setActiveTab("inKindAid")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "inKindAid"
              ? "border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <Gift className="w-4 h-4 text-amber-500" />
          Ayni Yardım
        </button>
      </div>

      {/* ========================================================= */}
      {/* 1. SEKME: VAKIF İŞLEMLERİ RAPORU                           */}
      {/* ========================================================= */}
      {activeTab === "transactions" && (
        <div className="space-y-6">
          {/* Filtreleme Formu */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchTransactions();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Metin Arama (Türkçe)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="İsim veya Detay"
                    value={txFilters.search}
                    onChange={(e) => setTxFilters({ ...txFilters, search: e.target.value })}
                    className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Yardım Türü
                </label>
                <select
                  value={txFilters.helpType}
                  onChange={(e) => setTxFilters({ ...txFilters, helpType: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Tümü</option>
                  {helpTypes.map((ht: any) => (
                    <option key={ht._id} value={ht._id}>
                      {ht.name}
                    </option>
                  ))}
                </select>
              </div>

              {session?.user?.role !== "personnel" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Personel
                  </label>
                  <select
                    value={txFilters.userId}
                    onChange={(e) => setTxFilters({ ...txFilters, userId: e.target.value })}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Tümü</option>
                    {users.map((u: any) => (
                      <option key={u._id} value={u._id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Başlangıç
                </label>
                <input
                  type="date"
                  value={txFilters.dateStart}
                  onChange={(e) => setTxFilters({ ...txFilters, dateStart: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Bitiş
                </label>
                <input
                  type="date"
                  value={txFilters.dateEnd}
                  onChange={(e) => setTxFilters({ ...txFilters, dateEnd: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-5 flex justify-end">
                <button
                  type="submit"
                  className="flex items-center px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm transition-colors"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Raporu Güncelle
                </button>
              </div>
            </form>
          </div>

          {/* İstatistik Grafiği ve Dağılım */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                İşlem Dağılımı (Son 7 Gün)
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={txChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="dateString" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Kayıt Sayısı" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-purple-600" />
                Yardım Türlerine Göre Dağılım
              </h2>
              {txHelpTypeStats.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">Veri bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {txHelpTypeStats.map((stat, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center"
                    >
                      <span className="text-xs font-semibold text-slate-700 truncate">{stat.name}</span>
                      <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full">
                        {stat.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rapor Tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none">
            <div ref={reportRef} className="p-6 print:p-0">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">T.C. SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI</h2>
                <h3 className="text-lg font-semibold text-slate-700">Vakıf İşlemleri Raporu</h3>
                <p className="text-slate-400 text-xs mt-1">
                  Oluşturulma Tarihi: {format(new Date(), "dd MMMM yyyy HH:mm", { locale: tr })}
                </p>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-500">Yükleniyor...</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="py-12 text-center text-slate-500">Kayıt bulunamadı.</div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="py-3 px-4 font-semibold text-slate-700 w-36">Tarih / Saat</th>
                      {session?.user?.role !== "personnel" && (
                        <th className="py-3 px-4 font-semibold text-slate-700 w-44">Personel</th>
                      )}
                      <th className="py-3 px-4 font-semibold text-slate-700">Vatandaş Bilgisi</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 w-48">Tür</th>
                      {session?.user?.role === "superadmin" && (
                        <th className="py-3 px-4 font-semibold text-slate-700 text-right print:hidden">
                          İşlem
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedTransactions.map((t: any) => (
                      <tr key={t._id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {format(new Date(t.createdAt), "dd/MM/yyyy HH:mm")}
                        </td>
                        {session?.user?.role !== "personnel" && (
                          <td className="py-3 px-4 font-medium text-slate-800">{t.userId?.name}</td>
                        )}
                        <td className="py-3 px-4 text-slate-800 font-medium">{t.citizenInfo}</td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            {t.helpType?.name || "-"}
                          </span>
                        </td>
                        {session?.user?.role === "superadmin" && (
                          <td className="py-3 px-4 text-right print:hidden">
                            <button
                              onClick={() => handleDeleteTx(t._id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <PaginationControls
              currentPage={Math.min(txPage, txTotalPages)}
              totalPages={txTotalPages}
              totalRecords={filteredTransactions.length}
              pageSize={reportPageSize}
              onPageChange={setTxPage}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* YENİ SEKME: DİLEKÇE İSTATİSTİKLERİ                         */}
      {/* ========================================================= */}
      {activeTab === "petitions" && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Personel</label>
                <select
                  value={petitionFilters.userId}
                  onChange={(e) => {
                    setPetitionFilters((p) => ({ ...p, userId: e.target.value }));
                    setPetPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                >
                  <option value="">Tüm Personeller</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dilekçe Türü</label>
                <select
                  value={petitionFilters.type}
                  onChange={(e) => {
                    setPetitionFilters((p) => ({ ...p, type: e.target.value }));
                    setPetPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                >
                  <option value="all">Tümü</option>
                  <option value="detayli">Detaylı Dilekçe</option>
                  <option value="matbu">Matbu Dilekçe</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Başlangıç</label>
                <input
                  type="date"
                  value={petitionFilters.dateStart}
                  onChange={(e) => {
                    setPetitionFilters((p) => ({ ...p, dateStart: e.target.value }));
                    setPetPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Bitiş</label>
                <input
                  type="date"
                  value={petitionFilters.dateEnd}
                  onChange={(e) => {
                    setPetitionFilters((p) => ({ ...p, dateEnd: e.target.value }));
                    setPetPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ara-Bul</label>
                <input
                  type="text"
                  value={petitionFilters.search}
                  onChange={(e) => {
                    setPetitionFilters((p) => ({ ...p, search: e.target.value }));
                    setPetPage(1);
                  }}
                  placeholder="Ad, TC, konu veya personel..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
            </div>
          </div>

          {/* Özet Kartlar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase">Toplam Dilekçe</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{filteredPetitions.length}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-indigo-600 uppercase">Detaylı Dilekçe</p>
              <p className="text-3xl font-extrabold text-indigo-700 mt-1">
                {filteredPetitions.filter((p) => p.petitionType !== "matbu").length}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-emerald-600 uppercase">Matbu Dilekçe</p>
              <p className="text-3xl font-extrabold text-emerald-700 mt-1">
                {filteredPetitions.filter((p) => p.petitionType === "matbu").length}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase">Aktif Personel</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{petitionStaffStats.length}</p>
            </div>
          </div>

          {/* Personel Bazlı Dilekçe Dağılımı */}
          {petitionStaffStats.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                Personel Bazlı Dilekçe İstatistikleri
              </h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={petitionStaffStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="detayli" name="Detaylı" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="matbu" name="Matbu" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Dilekçe Kayıtları Tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Dilekçe Kayıtları</h3>
              <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full">
                {filteredPetitions.length} Kayıt
              </span>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Yükleniyor...</div>
              ) : filteredPetitions.length === 0 ? (
                <div className="p-8 text-center text-slate-500">Eşleşen dilekçe kaydı bulunamadı.</div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="py-3 px-4 font-semibold text-slate-700">Tarih</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Tür</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Vatandaş Adı Soyadı</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">T.C. No</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Konu</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Personel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedPetitions.map((p: any) => (
                      <tr key={p._id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap font-mono text-xs">
                          {format(new Date(p.createdAt), "dd.MM.yyyy HH:mm")}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              p.petitionType === "matbu"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-indigo-100 text-indigo-800"
                            }`}
                          >
                            {p.petitionType === "matbu" ? "Matbu" : "Detaylı"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{p.citizenName}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{p.tcNo || "-"}</td>
                        <td className="py-3 px-4 text-slate-600">{p.subject || "-"}</td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {p.createdBy?.name || "Bilinmiyor"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <PaginationControls
              currentPage={Math.min(petPage, petTotalPages)}
              totalPages={petTotalPages}
              totalRecords={filteredPetitions.length}
              pageSize={reportPageSize}
              onPageChange={setPetPage}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* YENİ SEKME: SUNU İSTATİSTİKLERİ                            */}
      {/* ========================================================= */}
      {activeTab === "presentations" && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Personel</label>
                <select
                  value={presentationFilters.userId}
                  onChange={(e) => {
                    setPresentationFilters((p) => ({ ...p, userId: e.target.value }));
                    setPresPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                >
                  <option value="">Tüm Personeller</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Toplantı Dosyası</label>
                <select
                  value={presentationFilters.meetingId}
                  onChange={(e) => {
                    setPresentationFilters((p) => ({ ...p, meetingId: e.target.value }));
                    setPresPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                >
                  <option value="">Tüm Toplantılar</option>
                  {meetingList.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Başlangıç</label>
                <input
                  type="date"
                  value={presentationFilters.dateStart}
                  onChange={(e) => {
                    setPresentationFilters((p) => ({ ...p, dateStart: e.target.value }));
                    setPresPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Bitiş</label>
                <input
                  type="date"
                  value={presentationFilters.dateEnd}
                  onChange={(e) => {
                    setPresentationFilters((p) => ({ ...p, dateEnd: e.target.value }));
                    setPresPage(1);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ara-Bul</label>
                <input
                  type="text"
                  value={presentationFilters.search}
                  onChange={(e) => {
                    setPresentationFilters((p) => ({ ...p, search: e.target.value }));
                    setPresPage(1);
                  }}
                  placeholder="Sunu başlığı, toplantı veya personel..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
            </div>
          </div>

          {/* Özet Kartlar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase">Toplam Sunu</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{filteredPresentations.length}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-violet-600 uppercase">Toplam Slayt Sayısı</p>
              <p className="text-3xl font-extrabold text-violet-700 mt-1">
                {filteredPresentations.reduce((s, p) => s + (p.slideCount || 0), 0)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-blue-600 uppercase">Toplam Fotoğraf</p>
              <p className="text-3xl font-extrabold text-blue-700 mt-1">
                {filteredPresentations.reduce((s, p) => s + (p.totalPhotos || 0), 0)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase">Aktif Personel</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{presentationStaffStats.length}</p>
            </div>
          </div>

          {/* Personel Bazlı Sunu Grafiği */}
          {presentationStaffStats.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-violet-600" />
                Personel Bazlı Sunu & Slayt İstatistikleri
              </h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={presentationStaffStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Sunu Sayısı" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="slides" name="Slayt Sayısı" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Sunu Kayıtları Tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Sunu Kayıtları</h3>
              <span className="text-xs font-semibold px-2.5 py-1 bg-violet-100 text-violet-800 rounded-full">
                {filteredPresentations.length} Sunu
              </span>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Yükleniyor...</div>
              ) : filteredPresentations.length === 0 ? (
                <div className="p-8 text-center text-slate-500">Eşleşen sunu kaydı bulunamadı.</div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="py-3 px-4 font-semibold text-slate-700">Tarih</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Toplantı Dosyası</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Sunu Başlığı</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Slayt</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Fotoğraf</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Personel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedPresentations.map((p: any) => (
                      <tr key={p._id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap font-mono text-xs">
                          {format(new Date(p.createdAt), "dd.MM.yyyy HH:mm")}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">{p.meetingTitle || "-"}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{p.summaryTitle || "-"}</td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-violet-700">
                          {p.slideCount || 0}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-blue-700">
                          {p.totalPhotos || 0}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {p.createdBy?.name || "Bilinmiyor"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <PaginationControls
              currentPage={Math.min(presPage, presTotalPages)}
              totalPages={presTotalPages}
              totalRecords={filteredPresentations.length}
              pageSize={reportPageSize}
              onPageChange={setPresPage}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. SEKME: BEBEK MAMASI RAPORU                              */}
      {/* ========================================================= */}
      {activeTab === "babyFood" && (
        <div className="space-y-6">
          {/* Filtreleme */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchBabyFood();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Metin Arama (Türkçe)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Anne, TC veya Bebek"
                    value={babyFoodFilters.search}
                    onChange={(e) => setBabyFoodFilters({ ...babyFoodFilters, search: e.target.value })}
                    className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Mama Markası
                </label>
                <select
                  value={babyFoodFilters.brand}
                  onChange={(e) => setBabyFoodFilters({ ...babyFoodFilters, brand: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500"
                >
                  <option value="">Tümü</option>
                  {Array.from(new Set(babyFoodTypes.map((t) => t.brand))).map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>

              {session?.user?.role !== "personnel" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Personel
                  </label>
                  <select
                    value={babyFoodFilters.userId}
                    onChange={(e) => setBabyFoodFilters({ ...babyFoodFilters, userId: e.target.value })}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">Tümü</option>
                    {users.map((u: any) => (
                      <option key={u._id} value={u._id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Başlangıç
                </label>
                <input
                  type="date"
                  value={babyFoodFilters.dateStart}
                  onChange={(e) => setBabyFoodFilters({ ...babyFoodFilters, dateStart: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Bitiş
                </label>
                <input
                  type="date"
                  value={babyFoodFilters.dateEnd}
                  onChange={(e) => setBabyFoodFilters({ ...babyFoodFilters, dateEnd: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-5 flex justify-end">
                <button
                  type="submit"
                  className="flex items-center px-6 py-2.5 bg-pink-600 text-white rounded-xl hover:bg-pink-700 font-medium text-sm transition-colors"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Bebek Maması Raporla
                </button>
              </div>
            </form>
          </div>

          {/* İstatistik Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-pink-100 p-4 rounded-xl text-pink-600">
                <Package className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Toplam Dağıtılan Mama</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  {filteredBabyFood.reduce(
                    (sum, r) => sum + r.items?.reduce((s: number, it: any) => s + (it.quantity || 0), 0),
                    0
                  )}{" "}
                  Adet
                </h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-emerald-100 p-4 rounded-xl text-emerald-600">
                <UsersIcon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Faydalanan Aile Sayısı</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  {new Set(filteredBabyFood.map((r) => r.tcNo || extractTC(r.motherInfo) || r.motherInfo)).size}{" "}
                  Aile
                </h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-purple-100 p-4 rounded-xl text-purple-600">
                <Baby className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Toplam Teslimat İşlemi</p>
                <h3 className="text-2xl font-bold text-slate-800">{filteredBabyFood.length} Kayıt</h3>
              </div>
            </div>
          </div>

          {/* Grafikler */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-pink-600" />
                Mama Teslimatları (Son 7 Gün)
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={babyFoodChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="dateString" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Teslimat Sayısı" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-pink-600" />
                Mama Tür ve Numaralarına Göre Dağılım
              </h2>
              {babyFoodTypeStats.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">Veri bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {babyFoodTypeStats.map((stat, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center"
                    >
                      <span className="text-xs font-semibold text-slate-700 truncate">{stat.name}</span>
                      <span className="px-2 py-0.5 text-xs font-bold bg-pink-100 text-pink-700 rounded-full">
                        {stat.count} Adet
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rapor Tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none">
            <div className="p-6 print:p-0">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">T.C. SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI</h2>
                <h3 className="text-lg font-semibold text-slate-700">Bebek Maması Dağıtım ve Takip Raporu</h3>
                <p className="text-slate-400 text-xs mt-1">
                  Oluşturulma Tarihi: {format(new Date(), "dd MMMM yyyy HH:mm", { locale: tr })}
                </p>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-500">Yükleniyor...</div>
              ) : filteredBabyFood.length === 0 ? (
                <div className="py-12 text-center text-slate-500">Kayıt bulunamadı.</div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="py-3 px-4 font-semibold text-slate-700 w-32">Tarih</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Anne / T.C. Kimlik No</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 w-36">Teslim Alan</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 w-36">Bebek Adı</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Verilen Mamalar</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 w-40">Personel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedBabyFood.map((r: any) => {
                      const displayTc = r.tcNo || extractTC(r.motherInfo);
                      return (
                        <tr key={r._id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {format(new Date(r.deliveryDate || r.createdAt), "dd/MM/yyyy")}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            <div>{r.motherInfo}</div>
                            {displayTc && (
                              <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                TC: {displayTc}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{r.receiver || "Kendisi"}</td>
                          <td className="py-3 px-4 font-medium text-slate-700">{r.babyName}</td>
                          <td className="py-3 px-4">
                            <ul className="space-y-0.5 text-xs">
                              {r.items?.map((it: any, i: number) => (
                                <li key={i}>
                                  <strong>{it.quantity}x</strong> {it.brand} {it.foodName} ({it.weight})
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <span className="inline-block px-2 py-0.5 text-xs bg-slate-100 rounded-full font-medium">
                              {r.createdBy?.name || "Bilinmiyor"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <PaginationControls
              currentPage={Math.min(bfPage, bfTotalPages)}
              totalPages={bfTotalPages}
              totalRecords={filteredBabyFood.length}
              pageSize={reportPageSize}
              onPageChange={setBfPage}
            />
          </div>
        </div>
      )}

      {activeTab === "inKindAid" && (
        <div className="space-y-6">
          {/* Filtreleme */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchInKindAid();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Metin Arama (Türkçe)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="TC, Vatandaş, Adres veya Kalem"
                    value={inKindFilters.search}
                    onChange={(e) => setInKindFilters({ ...inKindFilters, search: e.target.value })}
                    className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Ayni Yardım Türü
                </label>
                <select
                  value={inKindFilters.aidType}
                  onChange={(e) => setInKindFilters({ ...inKindFilters, aidType: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Tümü</option>
                  {inKindTypes.map((t) => (
                    <option key={t._id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {session?.user?.role !== "personnel" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Personel
                  </label>
                  <select
                    value={inKindFilters.userId}
                    onChange={(e) => setInKindFilters({ ...inKindFilters, userId: e.target.value })}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Tümü</option>
                    {users.map((u: any) => (
                      <option key={u._id} value={u._id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Başlangıç
                </label>
                <input
                  type="date"
                  value={inKindFilters.dateStart}
                  onChange={(e) => setInKindFilters({ ...inKindFilters, dateStart: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Bitiş
                </label>
                <input
                  type="date"
                  value={inKindFilters.dateEnd}
                  onChange={(e) => setInKindFilters({ ...inKindFilters, dateEnd: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-5 flex justify-end">
                <button
                  type="submit"
                  className="flex items-center px-6 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-medium text-sm transition-colors"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Ayni Yardım Raporla
                </button>
              </div>
            </form>
          </div>

          {/* İstatistik Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-amber-100 p-4 rounded-xl text-amber-600">
                <Package className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Toplam Teslim Edilen Miktar</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  {filteredInKind.reduce(
                    (sum, r) => sum + r.items?.reduce((s: number, it: any) => s + (it.quantity || 0), 0),
                    0
                  )}{" "}
                  Kalem / Adet
                </h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-emerald-100 p-4 rounded-xl text-emerald-600">
                <UsersIcon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Ulaşılan Vatandaş / Hane</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  {new Set(filteredInKind.map((r) => r.tcNo || extractTC(r.citizenName) || r.citizenName)).size}{" "}
                  Hane
                </h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-blue-100 p-4 rounded-xl text-blue-600">
                <Gift className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Toplam Teslimat İşlemi</p>
                <h3 className="text-2xl font-bold text-slate-800">{filteredInKind.length} Kayıt</h3>
              </div>
            </div>
          </div>

          {/* Grafikler */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-amber-600" />
                Ayni Yardım Dağıtımı (Son 7 Gün)
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inKindChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="dateString" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Teslimat Sayısı" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-amber-600" />
                Ayni Yardım Türlerine Göre Dağılım
              </h2>
              {inKindTypeStats.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">Veri bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {inKindTypeStats.map((stat, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center"
                    >
                      <span className="text-xs font-semibold text-slate-700 truncate">{stat.name}</span>
                      <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">
                        {stat.count} Adet
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rapor Tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none">
            <div className="p-6 print:p-0">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">T.C. SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI</h2>
                <h3 className="text-lg font-semibold text-slate-700">Ayni Yardım Teslimat ve Takip Raporu</h3>
                <p className="text-slate-400 text-xs mt-1">
                  Oluşturulma Tarihi: {format(new Date(), "dd MMMM yyyy HH:mm", { locale: tr })}
                </p>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-500">Yükleniyor...</div>
              ) : filteredInKind.length === 0 ? (
                <div className="py-12 text-center text-slate-500">Kayıt bulunamadı.</div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="py-3 px-4 font-semibold text-slate-700 w-32">Tarih</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Vatandaş / TC Kimlik No</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 w-44">Teslim Alan / İletişim</th>
                      <th className="py-3 px-4 font-semibold text-slate-700">Verilen Ayni Yardımlar</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 w-32">Not</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 w-40">Personel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedInKind.map((r: any) => {
                      const displayTc = r.tcNo || extractTC(r.citizenName);
                      return (
                        <tr key={r._id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {format(new Date(r.deliveryDate || r.createdAt), "dd/MM/yyyy")}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            <div>{r.citizenName}</div>
                            {displayTc && (
                              <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                TC: {displayTc}
                              </span>
                            )}
                            {r.address && (
                              <div className="text-xs text-slate-400 font-normal truncate max-w-xs">
                                {r.address}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <div>{r.receiver || "Kendisi"}</div>
                            {r.phone && <div className="text-xs text-slate-400 font-mono">{r.phone}</div>}
                          </td>
                          <td className="py-3 px-4">
                            <ul className="space-y-0.5 text-xs">
                              {r.items?.map((it: any, i: number) => (
                                <li key={i}>
                                  <strong>{it.quantity} {it.unit}</strong> {it.aidType}
                                  {it.specification ? ` (${it.specification})` : ""}
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 italic">{r.notes || "-"}</td>
                          <td className="py-3 px-4 text-slate-700">
                            <span className="inline-block px-2 py-0.5 text-xs bg-slate-100 rounded-full font-medium">
                              {r.createdBy?.name || "Bilinmiyor"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <PaginationControls
              currentPage={Math.min(ikPage, ikTotalPages)}
              totalPages={ikTotalPages}
              totalRecords={filteredInKind.length}
              pageSize={reportPageSize}
              onPageChange={setIkPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}
