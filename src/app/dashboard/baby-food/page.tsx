"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { turkishIncludes, extractTC, exportToExcel } from "@/lib/turkish";

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

  const [formData, setFormData] = useState({
    tcNo: "",
    motherInfo: "",
    receiver: "",
    babyName: "",
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
    // If tcNo is empty, see if an 11 digit TC is inside motherInfo
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

  const handleDeleteType = async (id: string) => {
    if (!confirm("Bu tanımı silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/baby-food-types?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme başarısız");
      toast.success("Tanım silindi");
      fetchFoodTypes();
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    }
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

    // Son 30 gün içinde mama alınmışsa kırmızı uyarı onayı
    if (recentWarning && recentWarning.hasRecentDelivery) {
      const confirmMsg = `⚠️ DİKKAT!\n\nBu T.C. Kimlik Numarasına son 30 gün içinde (${recentWarning.daysAgo} gün önce) bebek maması teslim edilmiştir!\n\nYine de yeni mama teslim kaydı oluşturmak istiyor musunuz?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    try {
      const payload = {
        ...formData,
        // Anne bilgisi içine TC eklenmemişse otomatik ekle
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

  const handleDelete = async (id: string) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/baby-food?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme işlemi başarısız");
      toast.success("Kayıt başarıyla silindi");
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    }
  };

  const resetForm = () => {
    setFormData({
      tcNo: "",
      motherInfo: "",
      receiver: "",
      babyName: "",
      items: [],
    });
    setCurrentItem({ typeId: "", foodName: "", quantity: 1 });
    setRecentWarning(null);
  };

  const openEditModal = (record: BabyFoodRecord) => {
    setEditingRecord(record);
    const tc = record.tcNo || extractTC(record.motherInfo) || "";
    setFormData({
      tcNo: tc,
      motherInfo: record.motherInfo,
      receiver: record.receiver || "",
      babyName: record.babyName,
      items: record.items,
    });
    setRecentWarning(null);
    setIsModalOpen(true);
    if (tc) {
      checkRecentDelivery(tc);
    }
  };

  // Türkçe Karakter Uyumlu Arama Filtreleme
  const filteredRecords = records.filter(
    (record) =>
      (record.tcNo && turkishIncludes(record.tcNo, searchTerm)) ||
      turkishIncludes(record.motherInfo, searchTerm) ||
      (record.receiver && turkishIncludes(record.receiver, searchTerm)) ||
      turkishIncludes(record.babyName, searchTerm) ||
      record.items.some(
        (it) =>
          turkishIncludes(it.brand, searchTerm) ||
          turkishIncludes(it.foodName, searchTerm)
      )
  );

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

  // Excel Dışa Aktarma (Türkçe Karakter Uyumlu)
  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r, i) => {
      const tc = r.tcNo || extractTC(r.motherInfo) || "-";
      const itemsDetail = r.items
        .map((it) => `${it.quantity} adet ${it.brand} ${it.foodName} (${it.weight})`)
        .join("; ");
      const totalItemCount = r.items.reduce((sum, it) => sum + it.quantity, 0);

      return {
        "Sıra": i + 1,
        "Tarih": new Date(r.createdAt).toLocaleDateString("tr-TR"),
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

  return (
    <div className="space-y-6 print:space-y-0 print:bg-white">
      {/* Üst Başlık ve Aksiyon Alanı */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Baby className="w-8 h-8 text-pink-500" />
            Bebek Maması Takip Sistemi
          </h1>
          <p className="text-slate-500 mt-1">
            Ailelere teslim edilen bebek mamalarını yönetin, 30 gün kontrolü yapın ve raporlayın.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleExportExcel}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
            title="Türkçe Karakter Uyumlu Excel İndir"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Excel İndir
          </button>

          {(userRole === "manager" || userRole === "superadmin") && (
            <>
              <button
                onClick={() => window.print()}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-medium transition-all"
              >
                <Download className="w-5 h-5" />
                Rapor Çıktısı
              </button>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-all"
              >
                <Settings className="w-5 h-5" />
                Mama Türleri
              </button>
            </>
          )}

          <button
            onClick={() => {
              resetForm();
              setEditingRecord(null);
              setIsModalOpen(true);
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-pink-500/30"
          >
            <Plus className="w-5 h-5" />
            Yeni Kayıt
          </button>
        </div>
      </div>

      {/* İstatistikler ve Filtre Alanı */}
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-end gap-4 print:hidden">
          <div className="w-full md:w-auto flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Başlangıç Tarihi
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
              />
            </div>
          </div>
          <div className="w-full md:w-auto flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Bitiş Tarihi
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
              />
            </div>
          </div>
          <button
            onClick={fetchRecords}
            className="w-full md:w-auto flex items-center justify-center px-6 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors font-medium text-sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtrele
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="bg-pink-100 p-4 rounded-xl text-pink-600">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Toplam Teslim Edilen Mama</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalGiven} Adet</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="bg-green-100 p-4 rounded-xl text-green-600">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Ulaşılan Aile Sayısı</p>
              <h3 className="text-2xl font-bold text-slate-800">{uniqueFamilies} Aile</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-500" />
              Mamaların Tür ve Numaralarına Göre Dağılımı
            </h3>
          </div>
          <div className="p-4">
            {sortedDetailedStats.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Henüz veri yok.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedDetailedStats.map(([name, count], index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <span className="text-sm font-medium text-slate-700">{name}</span>
                    <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold bg-pink-100 text-pink-700 rounded-full">
                      {count} Adet
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tablo Alanı */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden print:shadow-none print:border-none print:mt-8">
        <div className="hidden print:block text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800">T.C. Sosyal Yardımlaşma ve Dayanışma Vakfı</h2>
          <h3 className="text-xl font-semibold text-slate-700 mt-1">Bebek Maması Dağıtım Raporu</h3>
          <p className="text-slate-500 mt-1 text-sm">
            {dateStart && dateEnd
              ? `${new Date(dateStart).toLocaleDateString("tr-TR")} - ${new Date(dateEnd).toLocaleDateString("tr-TR")} Tarihleri Arası`
              : "Tüm Kayıtlar"}
          </p>
        </div>

        <div className="p-6 border-b border-slate-100 print:hidden flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Türkçe karakter duyarlı Anne Adı, TC veya Bebek Adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-sm"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Toplam <strong>{filteredRecords.length}</strong> kayıt listeleniyor
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Anne / T.C. Kimlik No
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Teslim Alan
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Bebek Adı
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Mama Detayları
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Personel
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Tarih
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100 text-right print:hidden">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                      Yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const displayTc = record.tcNo || extractTC(record.motherInfo);
                  return (
                    <tr key={record._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-800">{record.motherInfo}</div>
                        {displayTc && (
                          <span className="inline-block mt-1 font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                            TC: {displayTc}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-600">
                        {record.receiver ? (
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {record.receiver}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Kendisi</span>
                        )}
                      </td>
                      <td className="py-4 px-6 font-medium text-slate-700">{record.babyName}</td>
                      <td className="py-4 px-6">
                        <ul className="space-y-1">
                          {record.items.map((item, idx) => (
                            <li key={idx} className="text-sm">
                              <span className="font-semibold text-slate-700">{item.quantity}x</span>{" "}
                              {item.brand} {item.foodName}{" "}
                              <span className="text-xs text-slate-400">({item.weight})</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {record.createdBy?.name || "Bilinmiyor"}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-600 whitespace-nowrap">
                        {new Date(record.createdAt).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="py-4 px-6 text-right print:hidden">
                        {((userRole === "personnel" && record.createdBy?._id === userId) ||
                          userRole === "superadmin" ||
                          userRole === "manager") && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditModal(record)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(record._id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

      {/* Ana Kayıt Ekleme / Düzenleme Modalı */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md p-6 border-b border-slate-100 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Baby className="w-6 h-6 text-pink-500" />
                {editingRecord ? "Mama Kaydını Düzenle" : "Yeni Bebek Maması Teslimi"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Kişi Bilgileri */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Kişi Bilgileri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* T.C. Kimlik No Alanı */}
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
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
                    <label className="text-sm font-medium text-slate-700">Anne Adı Soyadı</label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: Ayşe Yılmaz"
                      value={formData.motherInfo}
                      onChange={(e) => handleMotherInfoChange(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>

                  {/* KIRMIZI UYARI KUTUSU (Son 30 gün içinde mama alındıysa) */}
                  {recentWarning && recentWarning.hasRecentDelivery && (
                    <div className="md:col-span-2 p-4 bg-red-50 border-2 border-red-500 rounded-2xl shadow-sm text-red-900 space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-red-600 text-white p-1.5 rounded-lg animate-pulse">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-red-700 text-base tracking-tight">
                            UYARI: BU T.C. KİMLİK NUMARASINA SON 30 GÜN İÇİNDE MAMA VERİLMİŞTİR!
                          </h4>
                          <p className="text-xs text-red-600 font-medium">
                            Mükerrer veya erken teslimatı önlemek için lütfen önceki teslimat detayını inceleyiniz.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white/90 p-3.5 rounded-xl border border-red-200 text-sm space-y-1.5">
                        <div className="flex justify-between items-center border-b border-red-100 pb-1.5">
                          <span className="text-slate-600 font-medium">Son Teslim Tarihi:</span>
                          <span className="font-bold text-red-600">
                            {new Date(recentWarning.lastDeliveryDate).toLocaleDateString("tr-TR")}{" "}
                            ({recentWarning.daysAgo === 0 ? "Bugün verildi" : `${recentWarning.daysAgo} gün önce`})
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-red-100 pb-1.5">
                          <span className="text-slate-600 font-medium">Bebek Adı:</span>
                          <span className="font-semibold text-slate-800">
                            {recentWarning.latestRecord?.babyName || "-"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-red-100 pb-1.5">
                          <span className="text-slate-600 font-medium">Verilen Mamalar:</span>
                          <span className="font-semibold text-slate-800">
                            {recentWarning.latestRecord?.items
                              ?.map(
                                (it: any) =>
                                  `${it.quantity}x ${it.brand} ${it.foodName} (${it.weight})`
                              )
                              .join(", ")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 font-medium">Teslim Eden Personel:</span>
                          <span className="font-semibold text-slate-800">
                            {recentWarning.latestRecord?.personnelName || "Bilinmiyor"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Son 30 günde mama almadıysa onay kutusu */}
                  {formData.tcNo.length === 11 &&
                    !checkingRecent &&
                    (!recentWarning || !recentWarning.hasRecentDelivery) && (
                      <div className="md:col-span-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>Bu T.C. kimlik numarasına son 30 gün içinde mama kaydı bulunmuyor. Teslimat yapılabilir.</span>
                      </div>
                    )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">
                      Teslim Alan (Anne haricinde ise)
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: Baba, Anneanne, Teyze..."
                      value={formData.receiver}
                      onChange={(e) => setFormData({ ...formData, receiver: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Bebek Adı</label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: Yusuf Hamza"
                      value={formData.babyName}
                      onChange={(e) => setFormData({ ...formData, babyName: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Mama Ekleme Bölümü */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Teslim Edilen Mamalar
                </h3>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3 items-end">
                  <div className="space-y-1.5 flex-1 w-full">
                    <label className="text-sm font-medium text-slate-700">Marka ve Gramaj Seçimi</label>
                    <select
                      value={currentItem.typeId}
                      onChange={(e) => setCurrentItem({ ...currentItem, typeId: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    >
                      <option value="">Seçiniz...</option>
                      {foodTypes.map((type) => (
                        <option key={type._id} value={type._id}>
                          {type.brand} ({type.weight})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 w-full md:w-48">
                    <label className="text-sm font-medium text-slate-700">Numara</label>
                    <select
                      value={currentItem.foodName}
                      onChange={(e) => setCurrentItem({ ...currentItem, foodName: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    >
                      <option value="">Seçiniz...</option>
                      <option value="1 Numara">1 Numara</option>
                      <option value="2 Numara">2 Numara</option>
                      <option value="3 Numara">3 Numara</option>
                      <option value="4 Numara">4 Numara</option>
                      <option value="5 Numara">5 Numara</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 w-full md:w-32">
                    <label className="text-sm font-medium text-slate-700">Adet</label>
                    <input
                      type="number"
                      min="1"
                      value={currentItem.quantity}
                      onChange={(e) =>
                        setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) || 1 })
                      }
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addItemToForm}
                    className="w-full md:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Ekle
                  </button>
                </div>

                {formData.items.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-semibold text-slate-700">Marka / Tür</th>
                          <th className="py-3 px-4 font-semibold text-slate-700">Gramaj</th>
                          <th className="py-3 px-4 font-semibold text-slate-700 w-24">Adet</th>
                          <th className="py-3 px-4 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.items.map((item, idx) => (
                          <tr key={idx} className="bg-white">
                            <td className="py-3 px-4 font-medium text-slate-800">
                              {item.brand} {item.foodName}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{item.weight}</td>
                            <td className="py-3 px-4 font-semibold text-slate-800">{item.quantity}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => removeItemFromForm(idx)}
                                className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"
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

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-medium transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 text-white rounded-xl font-medium shadow-lg transition-all ${
                    recentWarning && recentWarning.hasRecentDelivery
                      ? "bg-red-600 hover:bg-red-700 shadow-red-500/30"
                      : "bg-pink-500 hover:bg-pink-600 shadow-pink-500/30"
                  }`}
                >
                  {editingRecord
                    ? "Güncelle"
                    : recentWarning && recentWarning.hasRecentDelivery
                    ? "Yine de Kaydet"
                    : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mama Türleri Ayarları Modalı */}
      {isSettingsModalOpen && (userRole === "manager" || userRole === "superadmin") && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-6 h-6 text-slate-500" />
                Mama Türleri Ayarları
              </h2>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <form
                onSubmit={handleAddType}
                className="bg-white p-5 rounded-xl border border-slate-200 mb-8 shadow-sm"
              >
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Yeni Marka & Gramaj Ekle</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Marka
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Aptamil"
                      value={newTypeData.brand}
                      onChange={(e) => setNewTypeData({ ...newTypeData, brand: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Gramaj
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="900gr"
                      value={newTypeData.weight}
                      onChange={(e) => setNewTypeData({ ...newTypeData, weight: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Türü Sisteme Ekle
                  </button>
                </div>
              </form>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Mevcut Tanımlar</h3>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {foodTypes.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">Henüz eklenmiş mama türü yok.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {foodTypes.map((type) => (
                        <li
                          key={type._id}
                          className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600">
                              <Package className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{type.brand}</p>
                              <p className="text-xs text-slate-500">{type.weight}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteType(type._id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
