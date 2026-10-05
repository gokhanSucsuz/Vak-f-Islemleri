"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Save, UserCircle, Activity, Clock, Trash2, Edit2, X, Check } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    citizenInfo: "",
    actionTaken: "",
    helpType: "",
  });
  
  const [transactions, setTransactions] = useState([]);
  const [helpTypes, setHelpTypes] = useState([]);
  const [todayStats, setTodayStats] = useState(0);
  
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    citizenInfo: "",
    actionTaken: "",
  });

  const fetchData = async () => {
    if (!session?.user?.id) return;
    try {
      // Sadece bugünün kayıtlarını çek
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      const params = new URLSearchParams({
        dateStart: todayStart.toISOString(),
        dateEnd: todayEnd.toISOString()
      });

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
        setTodayStats(data.transactions.length);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchData();
      fetchHelpTypes();
    }
  }, [session]);

  const fetchHelpTypes = async () => {
    try {
      const res = await fetch("/api/help-types");
      if (res.ok) {
        const data = await res.json();
        setHelpTypes(data.helpTypes);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success("İşlem başarıyla kaydedildi!");
        setFormData({ citizenInfo: "", actionTaken: "", helpType: "" });
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Bir hata oluştu");
      }
    } catch (error) {
      toast.error("İşlem kaydedilemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Kayıt silindi");
        fetchData();
      } else {
        toast.error("Silinemedi");
      }
    } catch (e) {
      toast.error("Bir hata oluştu");
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      if (res.ok) {
        toast.success("Kayıt güncellendi");
        setEditingId(null);
        fetchData();
      } else {
        toast.error("Güncellenemedi");
      }
    } catch (e) {
      toast.error("Bir hata oluştu");
    }
  };

  const startEditing = (t: any) => {
    setEditingId(t._id);
    setEditFormData({
      citizenInfo: t.citizenInfo,
      actionTaken: t.actionTaken,
    });
  };

  const isSuperAdminOrManager = session?.user?.role === "superadmin" || session?.user?.role === "manager";

  return (
    <div className="space-y-8">
      {/* İstatistik ve Başlık */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isSuperAdminOrManager ? "Sistem Genel Bakış" : "Yeni İşlem Kaydı"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isSuperAdminOrManager 
              ? "Sistemdeki tüm personel işlemlerini canlı takip edin." 
              : "Vatandaşla yapılan görüşme ve işlemi kayıt altına alın."}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-xl">
            <Activity className="text-blue-600 w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">
              {isSuperAdminOrManager ? "Bugünkü Toplam İşlemler" : "Bugünkü İşlemleriniz"}
            </p>
            <p className="text-2xl font-bold text-slate-800">{todayStats}</p>
          </div>
        </div>
      </div>

      {/* Kayıt Formu - Sadece Personel Görebilir */}
      {session?.user?.role === "personnel" && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Vatandaş Bilgisi (Ad Soyad ve TC Kimlik)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserCircle className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    name="citizenInfo"
                    required
                    value={formData.citizenInfo}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Örn: Ahmet Yılmaz - 12345678901"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Yardım / Başvuru Türü</label>
                <select
                  name="helpType"
                  required
                  value={formData.helpType}
                  onChange={handleChange}
                  className="block w-full p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="">Seçiniz...</option>
                  {helpTypes.map((ht: any) => (
                    <option key={ht._id} value={ht._id}>{ht.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Yapılan İşlem Detayı</label>
                <textarea
                  name="actionTaken"
                  required
                  rows={3}
                  value={formData.actionTaken}
                  onChange={handleChange}
                  className="block w-full p-4 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Görüşme detayı ve yapılan işlemi buraya yazınız..."
                ></textarea>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex items-center text-sm text-slate-500">
                  <Clock className="w-4 h-4 mr-2" />
                  İşlem saati otomatik kaydedilecektir.
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-70 transform hover:-translate-y-0.5"
                >
                  <Save className="w-5 h-5 mr-2" />
                  {loading ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kayıtlar Listesi */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">
            {isSuperAdminOrManager ? "Bugünkü Personel İşlemleri" : "Bugünkü Kayıtlarınız"}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm whitespace-nowrap">Tarih / Saat</th>
                {isSuperAdminOrManager && (
                  <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Personel</th>
                )}
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Vatandaş Bilgisi</th>
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Tür</th>
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm w-1/2">Yapılan İşlem</th>
                {session?.user?.role !== "manager" && (
                  <th className="py-3 px-6 font-semibold text-slate-600 text-sm text-right">İşlemler</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={session?.user?.role === "superadmin" ? 5 : 4} className="py-8 text-center text-slate-500">Henüz bir kayıt bulunmamaktadır.</td>
                </tr>
              ) : (
                transactions.map((t: any) => {
                  const isEditing = editingId === t._id;
                  
                  return (
                    <tr key={t._id} className="even:bg-slate-50/70 odd:bg-white hover:bg-slate-100 transition-colors">
                      <td className="py-4 px-6 text-sm text-slate-500 whitespace-nowrap align-top border-t border-slate-100">
                        {format(new Date(t.createdAt), "dd/MM/yyyy HH:mm")}
                      </td>

                      {isSuperAdminOrManager && (
                        <td className="py-4 px-6 text-sm text-slate-800 font-medium align-top border-t border-slate-100">
                          {t.userId?.name}
                        </td>
                      )}
                      
                      <td className="py-4 px-6 align-top border-t border-slate-100">
                        {isEditing ? (
                          <input 
                            type="text" 
                            name="citizenInfo"
                            value={editFormData.citizenInfo}
                            onChange={handleEditChange}
                            className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        ) : (
                          <span className="text-sm font-medium text-slate-800">{t.citizenInfo}</span>
                        )}
                      </td>

                      <td className="py-4 px-6 align-top border-t border-slate-100">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {t.helpType?.name || "-"}
                        </span>
                      </td>
                      
                      <td className="py-4 px-6 align-top border-t border-slate-100">
                        {isEditing ? (
                          <textarea 
                            name="actionTaken"
                            rows={3}
                            value={editFormData.actionTaken}
                            onChange={handleEditChange}
                            className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        ) : (
                          <span className="text-sm text-slate-600 whitespace-pre-wrap">{t.actionTaken}</span>
                        )}
                      </td>
                      
                      {session?.user?.role !== "manager" && (
                        <td className="py-4 px-6 align-top text-right whitespace-nowrap border-t border-slate-100">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleUpdate(t._id)} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: 1 }}>
                              <button onClick={() => startEditing(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Düzenle">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(t._id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" title="Sil">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
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
    </div>
  );
}
