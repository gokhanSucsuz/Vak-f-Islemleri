"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Gift,
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
  Phone,
  MapPin,
} from "lucide-react";
import { turkishIncludes, extractTC, exportToExcel } from "@/lib/turkish";

type InKindAidType = {
  _id: string;
  name: string;
  defaultUnit: string;
};

type InKindAidItem = {
  aidType: string;
  specification: string;
  unit: string;
  quantity: number;
};

type InKindAidRecord = {
  _id: string;
  tcNo: string;
  citizenName: string;
  receiver?: string;
  phone?: string;
  address?: string;
  items: InKindAidItem[];
  notes?: string;
  createdBy: { _id: string; name: string };
  createdAt: string;
};

export default function InKindAidPage() {
  const { data: session } = useSession();
  const [records, setRecords] = useState<InKindAidRecord[]>([]);
  const [aidTypes, setAidTypes] = useState<InKindAidType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRecord, setEditingRecord] = useState<InKindAidRecord | null>(null);

  const [formData, setFormData] = useState({
    tcNo: "",
    citizenName: "",
    receiver: "",
    phone: "",
    address: "",
    notes: "",
    items: [] as InKindAidItem[],
  });

  const [recentWarning, setRecentWarning] = useState<any | null>(null);
  const [checkingRecent, setCheckingRecent] = useState(false);

  const [newTypeData, setNewTypeData] = useState({
    name: "",
    defaultUnit: "Adet",
  });

  const [currentItem, setCurrentItem] = useState({
    aidType: "",
    specification: "",
    unit: "Adet",
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

      const res = await fetch(`/api/in-kind-aid?${params.toString()}`);
      if (!res.ok) throw new Error("Veriler alınamadı");
      const data = await res.json();
      setRecords(data);
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const fetchAidTypes = async () => {
    try {
      const res = await fetch("/api/in-kind-aid-types");
      if (res.ok) {
        const data = await res.json();
        setAidTypes(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (session) {
      fetchRecords();
      fetchAidTypes();
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
      const res = await fetch(`/api/in-kind-aid/check-recent?tc=${cleanTc}`);
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

  const handleCitizenNameChange = (val: string) => {
    setFormData((prev) => ({ ...prev, citizenName: val }));
    if (!formData.tcNo) {
      const extracted = extractTC(val);
      if (extracted && extracted.length === 11) {
        setFormData((prev) => ({ ...prev, tcNo: extracted }));
        checkRecentDelivery(extracted);
      }
    }
  };

  const handleTypeSelect = (typeName: string) => {
    const found = aidTypes.find((t) => t.name === typeName);
    setCurrentItem((prev) => ({
      ...prev,
      aidType: typeName,
      unit: found?.defaultUnit || prev.unit || "Adet",
    }));
  };

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/in-kind-aid-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTypeData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Tanım eklenemedi");
      }
      toast.success("Ayni yardım türü eklendi");
      setNewTypeData({ name: "", defaultUnit: "Adet" });
      fetchAidTypes();
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm("Bu tanımı silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/in-kind-aid-types?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme başarısız");
      toast.success("Tanım silindi");
      fetchAidTypes();
    } catch (error: any) {
      toast.error(error.message || "Bir hata oluştu");
    }
  };

  const addItemToForm = () => {
    if (!currentItem.aidType) {
      toast.error("Lütfen bir yardım türü seçin");
      return;
    }
    if (currentItem.quantity <= 0) {
      toast.error("Lütfen geçerli bir miktar girin");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          aidType: currentItem.aidType,
          specification: currentItem.specification.trim(),
          unit: currentItem.unit || "Adet",
          quantity: currentItem.quantity,
        },
      ],
    }));
    setCurrentItem({ aidType: "", specification: "", unit: "Adet", quantity: 1 });
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
      toast.error("Lütfen en az bir ayni yardım kalemi ekleyin");
      return;
    }

    // Son 30 gün içinde yardım alınmışsa onay uyarısı
    if (recentWarning && recentWarning.hasRecentDelivery) {
      const confirmMsg = `⚠️ DİKKAT!\n\nBu T.C. Kimlik Numarasına son 30 gün içinde (${recentWarning.daysAgo} gün önce) ayni yardım teslim edilmiştir!\n\nYine de yeni kayıt oluşturmak istiyor musunuz?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    try {
      if (editingRecord) {
        const res = await fetch("/api/in-kind-aid", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, _id: editingRecord._id }),
        });
        if (!res.ok) throw new Error("Güncelleme başarısız");
        toast.success("Kayıt başarıyla güncellendi");
      } else {
        const res = await fetch("/api/in-kind-aid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Kayıt başarısız");
        toast.success("Ayni yardım başarıyla kaydedildi");
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
      const res = await fetch(`/api/in-kind-aid?id=${id}`, { method: "DELETE" });
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
      citizenName: "",
      receiver: "",
      phone: "",
      address: "",
      notes: "",
      items: [],
    });
    setCurrentItem({ aidType: "", specification: "", unit: "Adet", quantity: 1 });
    setRecentWarning(null);
  };

  const openEditModal = (record: InKindAidRecord) => {
    setEditingRecord(record);
    const tc = record.tcNo || extractTC(record.citizenName) || "";
    setFormData({
      tcNo: tc,
      citizenName: record.citizenName,
      receiver: record.receiver || "",
      phone: record.phone || "",
      address: record.address || "",
      notes: record.notes || "",
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
      turkishIncludes(record.citizenName, searchTerm) ||
      (record.receiver && turkishIncludes(record.receiver, searchTerm)) ||
      (record.phone && turkishIncludes(record.phone, searchTerm)) ||
      (record.address && turkishIncludes(record.address, searchTerm)) ||
      record.items.some(
        (it) =>
          turkishIncludes(it.aidType, searchTerm) ||
          (it.specification && turkishIncludes(it.specification, searchTerm))
      )
  );

  const totalItemCount = records.reduce(
    (acc, curr) => acc + curr.items.reduce((sum, item) => sum + item.quantity, 0),
    0
  );
  const uniqueCitizens = new Set(
    records.map((r) => r.tcNo || extractTC(r.citizenName) || r.citizenName)
  ).size;

  const typeDistribution = records.reduce((acc, curr) => {
    curr.items.forEach((item) => {
      acc[item.aidType] = (acc[item.aidType] || 0) + item.quantity;
    });
    return acc;
  }, {} as Record<string, number>);

  const sortedDistribution = Object.entries(typeDistribution).sort((a, b) => b[1] - a[1]);

  // Excel Dışa Aktarma (Türkçe Karakter Uyumlu)
  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r, i) => {
      const itemsDetail = r.items
        .map((it) => `${it.quantity} ${it.unit} ${it.aidType}${it.specification ? ` (${it.specification})` : ""}`)
        .join("; ");
      const totalQuantity = r.items.reduce((sum, it) => sum + it.quantity, 0);

      return {
        "Sıra": i + 1,
        "Tarih": new Date(r.createdAt).toLocaleDateString("tr-TR"),
        "TC Kimlik No": r.tcNo || extractTC(r.citizenName) || "-",
        "Vatandaş Adı": r.citizenName,
        "Teslim Alan": r.receiver || "Kendisi",
        "Telefon": r.phone || "-",
        "Adres": r.address || "-",
        "Ayni Yardımlar": itemsDetail,
        "Toplam Miktar": totalQuantity,
        "Not": r.notes || "-",
        "Teslim Eden Personel": r.createdBy?.name || "Bilinmiyor",
      };
    });

    const dateStr = new Date().toISOString().split("T")[0];
    exportToExcel(exportData, `Ayni_Yardim_Teslim_Raporu_${dateStr}`, "Ayni Yardım");
    toast.success("Ayni yardım raporu Türkçe karakter uyumlu Excel olarak indirildi.");
  };

  return (
    <div className="space-y-6 print:space-y-0 print:bg-white">
      {/* Üst Başlık ve Aksiyon Alanı */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Gift className="w-8 h-8 text-amber-500" />
            Ayni Yardım Takip Sistemi
          </h1>
          <p className="text-slate-500 mt-1">
            Gıda kolisi, hijyen paketi, giyim ve diğer ayni yardım teslimatlarını kaydedin ve yönetin.
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
                Yardım Türleri
              </button>
            </>
          )}

          <button
            onClick={() => {
              resetForm();
              setEditingRecord(null);
              setIsModalOpen(true);
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-amber-500/30"
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
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
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
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
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
            <div className="bg-amber-100 p-4 rounded-xl text-amber-600">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Toplam Teslim Edilen Yardım</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalItemCount} Kalem / Adet</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="bg-emerald-100 p-4 rounded-xl text-emerald-600">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Ulaşılan Hane / Vatandaş</p>
              <h3 className="text-2xl font-bold text-slate-800">{uniqueCitizens} Kişi/Hane</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-500" />
              Ayni Yardım Türlerine Göre Dağılım
            </h3>
          </div>
          <div className="p-4">
            {sortedDistribution.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Henüz veri yok.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {sortedDistribution.map(([name, count], index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <span className="text-sm font-medium text-slate-700">{name}</span>
                    <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">
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
          <h3 className="text-xl font-semibold text-slate-700 mt-1">Ayni Yardım Teslimat Raporu</h3>
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
              placeholder="Türkçe karakter duyarlı TC, Vatandaş Adı, Teslim Alan veya Yardım Türü ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm"
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
                  Vatandaş / TC Kimlik No
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Teslim Alan / İletişim
                </th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">
                  Ayni Yardım Detayları
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
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      Yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const displayTc = record.tcNo || extractTC(record.citizenName);
                  return (
                    <tr key={record._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-800">{record.citizenName}</div>
                        {displayTc && (
                          <span className="inline-block mt-1 font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                            TC: {displayTc}
                          </span>
                        )}
                        {record.address && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 text-slate-400" /> {record.address}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-600">
                        {record.receiver ? (
                          <div className="font-medium text-slate-700">{record.receiver}</div>
                        ) : (
                          <span className="text-slate-400 italic">Kendisi</span>
                        )}
                        {record.phone && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                            <Phone className="w-3 h-3 text-slate-400" /> {record.phone}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <ul className="space-y-1">
                          {record.items.map((item, idx) => (
                            <li key={idx} className="text-sm">
                              <span className="font-semibold text-slate-800">
                                {item.quantity} {item.unit}
                              </span>{" "}
                              <span className="text-amber-800 font-medium">{item.aidType}</span>
                              {item.specification && (
                                <span className="text-xs text-slate-500 ml-1">
                                  ({item.specification})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {record.notes && (
                          <p className="text-xs text-slate-400 mt-1 italic">
                            Not: {record.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
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

      {/* Ayni Yardım Ekle / Düzenle Modalı */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md p-6 border-b border-slate-100 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Gift className="w-6 h-6 text-amber-500" />
                {editingRecord ? "Ayni Yardım Kaydını Düzenle" : "Yeni Ayni Yardım Teslimi"}
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
                  Vatandaş & İletişim Bilgileri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* T.C. Kimlik Numarası */}
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
                      <span>T.C. Kimlik Numarası</span>
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
                          : "border-slate-200 focus:ring-amber-500/20 focus:border-amber-500"
                      }`}
                    />
                  </div>

                  {/* Vatandaş Adı Soyadı */}
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-sm font-medium text-slate-700">Vatandaş Adı Soyadı</label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: Mehmet Demir"
                      value={formData.citizenName}
                      onChange={(e) => handleCitizenNameChange(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    />
                  </div>

                  {/* KIRMIZI UYARI KUTUSU (Son 30 günde ayni yardım verildiyse) */}
                  {recentWarning && recentWarning.hasRecentDelivery && (
                    <div className="md:col-span-2 p-4 bg-red-50 border-2 border-red-500 rounded-2xl shadow-sm text-red-900 space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-red-600 text-white p-1.5 rounded-lg animate-pulse">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-red-700 text-base tracking-tight">
                            UYARI: BU T.C. NUMARASINA SON 30 GÜN İÇİNDE AYNİ YARDIM VERİLMİŞTİR!
                          </h4>
                          <p className="text-xs text-red-600 font-medium">
                            Mükerrer teslimatı önlemek için lütfen önceki yardım detaylarını kontrol ediniz.
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
                          <span className="text-slate-600 font-medium">Verilen Yardımlar:</span>
                          <span className="font-semibold text-slate-800">
                            {recentWarning.latestRecord?.items
                              ?.map((it: any) => `${it.quantity} ${it.unit} ${it.aidType}`)
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

                  {formData.tcNo.length === 11 &&
                    !checkingRecent &&
                    (!recentWarning || !recentWarning.hasRecentDelivery) && (
                      <div className="md:col-span-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>Bu T.C. kimlik numarasına son 30 gün içinde ayni yardım kaydı bulunmuyor.</span>
                      </div>
                    )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">
                      Teslim Alan (Vatandaş haricinde ise)
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: Eşi, Oğlu, Kızı, Kendisi..."
                      value={formData.receiver}
                      onChange={(e) => setFormData({ ...formData, receiver: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Telefon Numarası</label>
                    <input
                      type="tel"
                      placeholder="05XXXXXXXXX"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Adres / Mahalle</label>
                    <input
                      type="text"
                      placeholder="Örn: Fatih Mah. Atatürk Cad. No: 12"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Yardım Kalemleri Ekleme Bölümü */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Teslim Edilen Ayni Yardım Kalemleri
                </h3>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3 items-end">
                  <div className="space-y-1.5 flex-1 w-full">
                    <label className="text-sm font-medium text-slate-700">Yardım Türü</label>
                    <select
                      value={currentItem.aidType}
                      onChange={(e) => handleTypeSelect(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    >
                      <option value="">Yardım türü seçiniz...</option>
                      {aidTypes.map((type) => (
                        <option key={type._id} value={type.name}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 flex-1 w-full">
                    <label className="text-sm font-medium text-slate-700">Açıklama / Detay</label>
                    <input
                      type="text"
                      placeholder="Örn: Standart Koli, 38 No Bot vb."
                      value={currentItem.specification}
                      onChange={(e) =>
                        setCurrentItem({ ...currentItem, specification: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5 w-full md:w-32">
                    <label className="text-sm font-medium text-slate-700">Birim</label>
                    <select
                      value={currentItem.unit}
                      onChange={(e) => setCurrentItem({ ...currentItem, unit: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    >
                      <option value="Koli">Koli</option>
                      <option value="Adet">Adet</option>
                      <option value="Paket">Paket</option>
                      <option value="Çuval">Çuval</option>
                      <option value="Kg">Kg</option>
                      <option value="Set">Set</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 w-full md:w-28">
                    <label className="text-sm font-medium text-slate-700">Miktar</label>
                    <input
                      type="number"
                      min="1"
                      value={currentItem.quantity}
                      onChange={(e) =>
                        setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) || 1 })
                      }
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
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
                          <th className="py-3 px-4 font-semibold text-slate-700">Yardım Türü</th>
                          <th className="py-3 px-4 font-semibold text-slate-700">Açıklama / Detay</th>
                          <th className="py-3 px-4 font-semibold text-slate-700 w-24">Birim</th>
                          <th className="py-3 px-4 font-semibold text-slate-700 w-24">Miktar</th>
                          <th className="py-3 px-4 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.items.map((item, idx) => (
                          <tr key={idx} className="bg-white">
                            <td className="py-3 px-4 font-semibold text-slate-800">{item.aidType}</td>
                            <td className="py-3 px-4 text-slate-600">{item.specification || "-"}</td>
                            <td className="py-3 px-4 text-slate-600">{item.unit}</td>
                            <td className="py-3 px-4 font-bold text-amber-700">{item.quantity}</td>
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

              {/* Not Alanı */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">İşlem Notu (İsteğe bağlı)</label>
                <input
                  type="text"
                  placeholder="Vakıf kararı, dosya no veya ek notlar..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm"
                />
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
                      : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/30"
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

      {/* Ayni Yardım Türleri Ayarları Modalı */}
      {isSettingsModalOpen && (userRole === "manager" || userRole === "superadmin") && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-6 h-6 text-slate-500" />
                Ayni Yardım Türleri Yönetimi
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
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Yeni Yardım Türü Ekle</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Tür Adı
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: Hijyen Kolisi"
                      value={newTypeData.name}
                      onChange={(e) => setNewTypeData({ ...newTypeData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Varsayılan Birim
                    </label>
                    <select
                      value={newTypeData.defaultUnit}
                      onChange={(e) => setNewTypeData({ ...newTypeData, defaultUnit: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                    >
                      <option value="Koli">Koli</option>
                      <option value="Adet">Adet</option>
                      <option value="Paket">Paket</option>
                      <option value="Çuval">Çuval</option>
                      <option value="Kg">Kg</option>
                      <option value="Set">Set</option>
                    </select>
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
                  {aidTypes.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      Henüz eklenmiş yardım türü yok.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {aidTypes.map((type) => (
                        <li
                          key={type._id}
                          className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                              <Package className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{type.name}</p>
                              <p className="text-xs text-slate-500">Birim: {type.defaultUnit}</p>
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
