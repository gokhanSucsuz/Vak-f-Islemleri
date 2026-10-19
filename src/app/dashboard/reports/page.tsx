"use client";

import { useState, useEffect, useRef } from "react";
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

type ReportTab = "transactions" | "babyFood" | "inKindAid";

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

  // Genel kullanıcı listesi ve başlangıç verileri
  useEffect(() => {
    fetchUsers();
    fetchHelpTypes();
    fetchBabyFoodTypes();
    fetchInKindTypes();
  }, []);

  useEffect(() => {
    if (activeTab === "transactions") {
      fetchTransactions();
    } else if (activeTab === "babyFood") {
      fetchBabyFood();
    } else if (activeTab === "inKindAid") {
      fetchInKindAid();
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
      const itemDate = new Date(item[dateField]);
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
      if (txFilters.dateStart) params.append("dateStart", new Date(txFilters.dateStart).toISOString());
      if (txFilters.dateEnd) {
        const endDate = new Date(txFilters.dateEnd);
        endDate.setHours(23, 59, 59, 999);
        params.append("dateEnd", endDate.toISOString());
      }

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
      if (babyFoodFilters.dateStart) params.append("dateStart", new Date(babyFoodFilters.dateStart).toISOString());
      if (babyFoodFilters.dateEnd) {
        const endDate = new Date(babyFoodFilters.dateEnd);
        endDate.setHours(23, 59, 59, 999);
        params.append("dateEnd", endDate.toISOString());
      }

      const res = await fetch(`/api/baby-food?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBabyFoodRecords(data || []);
        setBabyFoodChartData(generate7DayTimeline(data || []));

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
      if (inKindFilters.dateStart) params.append("dateStart", new Date(inKindFilters.dateStart).toISOString());
      if (inKindFilters.dateEnd) {
        const endDate = new Date(inKindFilters.dateEnd);
        endDate.setHours(23, 59, 59, 999);
        params.append("dateEnd", endDate.toISOString());
      }

      const res = await fetch(`/api/in-kind-aid?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInKindRecords(data || []);
        setInKindChartData(generate7DayTimeline(data || []));

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

  // --- EXCEL DIŞA AKTARMA (TÜRKÇE KARAKTER UYUMLU) ---
  const exportTxExcel = () => {
    const exportData = filteredTransactions.map((t, idx) => ({
      "Sıra": idx + 1,
      "Tarih": format(new Date(t.createdAt), "dd.MM.yyyy HH:mm"),
      "Personel": t.userId?.name || "-",
      "Vatandaş Bilgisi": t.citizenInfo,
      "Yardım Türü": t.helpType?.name || "Belirtilmemiş",
    }));
    exportToExcel(exportData, `Vakif_Islemleri_Raporu_${new Date().toISOString().split("T")[0]}`, "İşlemler");
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
        "Tarih": format(new Date(r.createdAt), "dd.MM.yyyy"),
        "TC Kimlik No": tc,
        "Anne Bilgisi": r.motherInfo,
        "Teslim Alan": r.receiver || "Kendisi",
        "Bebek Adı": r.babyName,
        "Teslim Edilen Mamalar": itemsDetail,
        "Toplam Adet": totalQty,
        "Personel": r.createdBy?.name || "Bilinmiyor",
      };
    });
    exportToExcel(exportData, `Bebek_Mamasi_Raporu_${new Date().toISOString().split("T")[0]}`, "Bebek Maması");
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
        "Tarih": format(new Date(r.createdAt), "dd.MM.yyyy"),
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
    exportToExcel(exportData, `Ayni_Yardim_Raporu_${new Date().toISOString().split("T")[0]}`, "Ayni Yardım");
    toast.success("Ayni Yardım raporu Türkçe karakter uyumlu Excel olarak indirildi.");
  };

  const exportPDF = () => {
    window.print();
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
              className="inline-flex items-center justify-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Tüm Geçmişi Sil
            </button>
          )}

          <button
            onClick={
              activeTab === "transactions"
                ? exportTxExcel
                : activeTab === "babyFood"
                ? exportBabyFoodExcel
                : exportInKindExcel
            }
            className="inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
            title="Türkçe Karakter Uyumlu Excel İndir"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Excel İndir
          </button>

          <button
            onClick={exportPDF}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            PDF / Yazdır
          </button>
        </div>
      </div>

      {/* Rapor Sekmeleri */}
      <div className="flex border-b border-slate-200 gap-2 print:hidden">
        <button
          onClick={() => setActiveTab("transactions")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "transactions"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <FileText className="w-4 h-4" />
          Vakıf İşlemleri Raporu
        </button>

        <button
          onClick={() => setActiveTab("babyFood")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "babyFood"
              ? "border-pink-500 text-pink-600 bg-pink-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <Baby className="w-4 h-4 text-pink-500" />
          Bebek Maması Raporu
        </button>

        <button
          onClick={() => setActiveTab("inKindAid")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "inKindAid"
              ? "border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-xl"
          }`}
        >
          <Gift className="w-4 h-4 text-amber-500" />
          Ayni Yardım Raporu
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
                    {filteredTransactions.map((t: any) => (
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
                    {filteredBabyFood.map((r: any) => {
                      const displayTc = r.tcNo || extractTC(r.motherInfo);
                      return (
                        <tr key={r._id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {format(new Date(r.createdAt), "dd/MM/yyyy")}
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
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. SEKME: AYNİ YARDIM RAPORU                               */}
      {/* ========================================================= */}
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
                    {filteredInKind.map((r: any) => {
                      const displayTc = r.tcNo || extractTC(r.citizenName);
                      return (
                        <tr key={r._id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {format(new Date(r.createdAt), "dd/MM/yyyy")}
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
          </div>
        </div>
      )}
    </div>
  );
}
