"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Plus, Search, Edit2, Trash2, Baby, Package, Users, Activity, Settings, X } from "lucide-react";

type BabyFoodType = {
  _id: string;
  brand: string;
  foodName: string;
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
    motherInfo: "",
    receiver: "",
    babyName: "",
    items: [] as BabyFoodItem[],
  });

  const [newTypeData, setNewTypeData] = useState({
    brand: "",
    foodName: "",
    weight: "",
  });

  const [currentItem, setCurrentItem] = useState({
    typeId: "",
    quantity: 1,
  });

  const userRole = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/baby-food");
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
      setNewTypeData({ brand: "", foodName: "", weight: "" });
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
      toast.error("Lütfen bir mama türü seçin");
      return;
    }
    const selectedType = foodTypes.find(t => t._id === currentItem.typeId);
    if (!selectedType) return;

    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          brand: selectedType.brand,
          foodName: selectedType.foodName,
          weight: selectedType.weight,
          quantity: currentItem.quantity,
        }
      ]
    }));
    setCurrentItem({ typeId: "", quantity: 1 });
  };

  const removeItemFromForm = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      toast.error("Lütfen en az bir adet mama ekleyin");
      return;
    }

    try {
      if (editingRecord) {
        const res = await fetch("/api/baby-food", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, _id: editingRecord._id }),
        });
        if (!res.ok) throw new Error("Güncelleme başarısız");
        toast.success("Kayıt başarıyla güncellendi");
      } else {
        const res = await fetch("/api/baby-food", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
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
      motherInfo: "",
      receiver: "",
      babyName: "",
      items: [],
    });
    setCurrentItem({ typeId: "", quantity: 1 });
  };

  const openEditModal = (record: BabyFoodRecord) => {
    setEditingRecord(record);
    setFormData({
      motherInfo: record.motherInfo,
      receiver: record.receiver || "",
      babyName: record.babyName,
      items: record.items,
    });
    setIsModalOpen(true);
  };

  const filteredRecords = records.filter(
    (record) =>
      record.motherInfo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.receiver && record.receiver.toLowerCase().includes(searchTerm.toLowerCase())) ||
      record.babyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalGiven = records.reduce((acc, curr) => acc + curr.items.reduce((sum, item) => sum + item.quantity, 0), 0);
  const uniqueFamilies = new Set(records.map(r => r.motherInfo)).size;
  const brandStats = records.reduce((acc, curr) => {
    curr.items.forEach(item => {
      acc[item.brand] = (acc[item.brand] || 0) + item.quantity;
    });
    return acc;
  }, {} as Record<string, number>);
  const topBrand = Object.entries(brandStats).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Baby className="w-8 h-8 text-pink-500" />
            Bebek Maması Takip Sistemi
          </h1>
          <p className="text-slate-500 mt-1">Ailelere teslim edilen bebek mamalarını yönetin ve takip edin.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {(userRole === "manager" || userRole === "superadmin") && (
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-medium transition-all"
            >
              <Settings className="w-5 h-5" />
              Mama Türleri
            </button>
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

      {(userRole === "manager" || userRole === "superadmin") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="bg-blue-100 p-4 rounded-xl text-blue-600">
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
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="bg-purple-100 p-4 rounded-xl text-purple-600">
              <Activity className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">En Çok Tercih Edilen Marka</p>
              <h3 className="text-2xl font-bold text-slate-800">{topBrand}</h3>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Anne Adı, TC veya Bebek Adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">Anne / Teslim Alan</th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">Bebek Adı</th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">Mama Detayları</th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">Personel</th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">Tarih</th>
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                      Yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">Kayıt bulunamadı.</td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-medium text-slate-800 line-clamp-1">{record.motherInfo}</div>
                      {record.receiver && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Users className="w-3 h-3" /> Teslim Alan: {record.receiver}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-700">{record.babyName}</td>
                    <td className="py-4 px-6">
                      <ul className="space-y-1">
                        {record.items.map((item, idx) => (
                          <li key={idx} className="text-sm">
                            <span className="font-semibold text-slate-700">{item.quantity}x</span> {item.brand} {item.foodName} <span className="text-xs text-slate-400">({item.weight})</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {record.createdBy?.name || "Bilinmiyor"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600">
                      {new Date(record.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {((userRole === "personnel" && record.createdBy?._id === userId) || userRole === "superadmin" || userRole === "manager") && (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white/80 backdrop-blur-md p-6 border-b border-slate-100 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Baby className="w-6 h-6 text-pink-500" />
                {editingRecord ? "Mama Kaydını Düzenle" : "Yeni Mama Teslimi Ekle"}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">
              {/* Kişi Bilgileri */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Kişi Bilgileri</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Anne Adı Soyadı ve TC Kimlik No</label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: Ayşe Yılmaz - 12345678901"
                      value={formData.motherInfo}
                      onChange={(e) => setFormData({ ...formData, motherInfo: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Teslim Alan (Anne yoksa)</label>
                    <input
                      type="text"
                      placeholder="İsteğe bağlı..."
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
                      value={formData.babyName}
                      onChange={(e) => setFormData({ ...formData, babyName: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Mama Ekleme Bölümü */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Teslim Edilen Mamalar</h3>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3 items-end">
                  <div className="space-y-1.5 flex-1 w-full">
                    <label className="text-sm font-medium text-slate-700">Mama Seçimi</label>
                    <select
                      value={currentItem.typeId}
                      onChange={(e) => setCurrentItem({ ...currentItem, typeId: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    >
                      <option value="">Seçiniz...</option>
                      {foodTypes.map(type => (
                        <option key={type._id} value={type._id}>
                          {type.brand} {type.foodName} ({type.weight})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 w-full md:w-32">
                    <label className="text-sm font-medium text-slate-700">Adet</label>
                    <input
                      type="number"
                      min="1"
                      value={currentItem.quantity}
                      onChange={(e) => setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) })}
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
                            <td className="py-3 px-4 font-medium text-slate-800">{item.brand} {item.foodName}</td>
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
                  className="px-5 py-2.5 text-white bg-pink-500 hover:bg-pink-600 rounded-xl font-medium shadow-lg shadow-pink-500/30 transition-all"
                >
                  {editingRecord ? "Güncelle" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal (Types) */}
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
              <form onSubmit={handleAddType} className="bg-white p-5 rounded-xl border border-slate-200 mb-8 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Yeni Mama Türü Ekle</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Marka</label>
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
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tür / No</label>
                    <input
                      required
                      type="text"
                      placeholder="1 Numara"
                      value={newTypeData.foodName}
                      onChange={(e) => setNewTypeData({ ...newTypeData, foodName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Gramaj</label>
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
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
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
                      {foodTypes.map(type => (
                        <li key={type._id} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600">
                              <Package className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{type.brand} {type.foodName}</p>
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
