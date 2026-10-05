"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Plus, Search, Edit2, Trash2, Baby, Package, Users, Activity } from "lucide-react";

type BabyFoodRecord = {
  _id: string;
  motherName: string;
  motherTc: string;
  babyName: string;
  foodName: string;
  brand: string;
  quantity: number;
  weight: string;
  createdBy: { _id: string; name: string };
  createdAt: string;
};

export default function BabyFoodPage() {
  const { data: session } = useSession();
  const [records, setRecords] = useState<BabyFoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRecord, setEditingRecord] = useState<BabyFoodRecord | null>(null);

  const [formData, setFormData] = useState({
    motherName: "",
    motherTc: "",
    babyName: "",
    foodName: "",
    brand: "",
    quantity: 1,
    weight: "",
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

  useEffect(() => {
    if (session) {
      fetchRecords();
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      motherName: "",
      motherTc: "",
      babyName: "",
      foodName: "",
      brand: "",
      quantity: 1,
      weight: "",
    });
  };

  const openEditModal = (record: BabyFoodRecord) => {
    setEditingRecord(record);
    setFormData({
      motherName: record.motherName,
      motherTc: record.motherTc,
      babyName: record.babyName,
      foodName: record.foodName,
      brand: record.brand,
      quantity: record.quantity,
      weight: record.weight,
    });
    setIsModalOpen(true);
  };

  const filteredRecords = records.filter(
    (record) =>
      record.motherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.motherTc.includes(searchTerm) ||
      record.babyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.brand.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Statistics for Managers and Super Admins
  const totalGiven = records.reduce((acc, curr) => acc + curr.quantity, 0);
  const uniqueFamilies = new Set(records.map(r => r.motherTc)).size;
  const brandStats = records.reduce((acc, curr) => {
    acc[curr.brand] = (acc[curr.brand] || 0) + curr.quantity;
    return acc;
  }, {} as Record<string, number>);
  const topBrand = Object.entries(brandStats).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Baby className="w-8 h-8 text-pink-500" />
            Bebek Maması Takip Sistemi
          </h1>
          <p className="text-slate-500 mt-1">Ailelere teslim edilen bebek mamalarını yönetin ve takip edin.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingRecord(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-pink-500/30"
        >
          <Plus className="w-5 h-5" />
          Yeni Mama Teslimi
        </button>
      </div>

      {(userRole === "manager" || userRole === "superadmin") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-blue-100 p-4 rounded-xl text-blue-600">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Toplam Teslim Edilen Mama</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalGiven} Adet</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-green-100 p-4 rounded-xl text-green-600">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Ulaşılan Aile Sayısı</p>
              <h3 className="text-2xl font-bold text-slate-800">{uniqueFamilies} Aile</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
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
              placeholder="Anne Adı, TC, Bebek Adı veya Marka ile ara..."
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
                <th className="py-4 px-6 text-sm font-semibold text-slate-600 border-b border-slate-100">Anne Bilgileri</th>
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
                      <div className="font-medium text-slate-800">{record.motherName}</div>
                      <div className="text-xs text-slate-500">TC: {record.motherTc}</div>
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-700">{record.babyName}</td>
                    <td className="py-4 px-6">
                      <div className="font-medium text-slate-800">{record.foodName} ({record.brand})</div>
                      <div className="text-xs text-slate-500">{record.quantity} Adet • {record.weight}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">
                {editingRecord ? "Mama Kaydını Düzenle" : "Yeni Mama Teslimi Ekle"}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Anne Adı Soyadı</label>
                  <input
                    required
                    type="text"
                    value={formData.motherName}
                    onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Anne TC Kimlik No</label>
                  <input
                    required
                    type="text"
                    maxLength={11}
                    value={formData.motherTc}
                    onChange={(e) => setFormData({ ...formData, motherTc: e.target.value })}
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

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Mama Cinsi/Türü</label>
                  <input
                    required
                    type="text"
                    placeholder="Örn: 1 Numara Devam Sütü"
                    value={formData.foodName}
                    onChange={(e) => setFormData({ ...formData, foodName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Marka</label>
                  <input
                    required
                    type="text"
                    placeholder="Örn: Aptamil, Bebelac vs."
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Adet</label>
                    <input
                      required
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Gramaj</label>
                    <input
                      required
                      type="text"
                      placeholder="Örn: 900g, 350g"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
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
    </div>
  );
}
