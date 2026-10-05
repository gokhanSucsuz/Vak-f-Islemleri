"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Download, Filter, Search, Calendar, User as UserIcon, BarChart3, Trash2 } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

export default function ReportsPage() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    userId: "",
    dateStart: "",
    dateEnd: "",
    search: "",
    helpType: "",
  });

  const [helpTypes, setHelpTypes] = useState([]);

  // İstatistik datası (Son 7 Gün için)
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchTransactions();
    fetchHelpTypes();
  }, []);

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

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const calculateChartData = (data: any[]) => {
    // Sadece son 7 günün verilerini grupla
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = subDays(new Date(), i);
      return {
        dateString: format(d, "dd MMM", { locale: tr }),
        dateRaw: d,
        count: 0
      };
    }).reverse();

    data.forEach((t: any) => {
      const tDate = new Date(t.createdAt);
      const tString = format(tDate, "dd MMM", { locale: tr });
      
      const dayNode = last7Days.find(d => d.dateString === tString);
      if (dayNode) {
        dayNode.count += 1;
      }
    });

    setChartData(last7Days);
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.userId) params.append("userId", filters.userId);
      if (filters.search) params.append("search", filters.search);
      if (filters.helpType) params.append("helpType", filters.helpType);
      if (filters.dateStart) params.append("dateStart", new Date(filters.dateStart).toISOString());
      
      if (filters.dateEnd) {
        const endDate = new Date(filters.dateEnd);
        endDate.setHours(23, 59, 59, 999);
        params.append("dateEnd", endDate.toISOString());
      }

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
        calculateChartData(data.transactions);
      }
    } catch (error) {
      toast.error("Raporlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransactions();
  };

  const exportPDF = () => {
    window.print();
  };

  const handleDeleteAll = async () => {
    if (!confirm("Tüm geçmiş kayıtları silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
    
    try {
      const res = await fetch("/api/transactions", { method: "DELETE" });
      if (res.ok) {
        toast.success("Tüm geçmiş silindi");
        fetchTransactions();
      } else {
        toast.error("Silinemedi");
      }
    } catch (e) {
      toast.error("Bir hata oluştu");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Kayıt silindi");
        fetchTransactions();
      } else {
        toast.error("Silinemedi");
      }
    } catch (e) {
      toast.error("Bir hata oluştu");
    }
  };

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Arşiv ve Raporlama</h1>
          <p className="text-slate-500 text-sm mt-1">Geçmiş günlerin dosyalarına ulaşın, personele göre filtreleyin ve arşiv yönetimi yapın.</p>
        </div>
        
        <div className="flex gap-2">
          {session?.user?.role === "superadmin" && (
            <button
              onClick={handleDeleteAll}
              className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium text-sm"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Tüm Geçmişi Sil
            </button>
          )}
          <button
            onClick={exportPDF}
            className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-sm font-medium text-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            PDF Çıktısı Al
          </button>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
          
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Metin Arama</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                name="search"
                placeholder="İsim veya Detay"
                value={filters.search}
                onChange={handleFilterChange}
                className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tür</label>
            <div className="relative">
              <select
                name="helpType"
                value={filters.helpType}
                onChange={handleFilterChange}
                className="block w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
              >
                <option value="">Tümü</option>
                {helpTypes.map((ht: any) => (
                  <option key={ht._id} value={ht._id}>{ht.name}</option>
                ))}
              </select>
            </div>
          </div>

          {session?.user?.role !== "personnel" && (
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Personel</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-4 w-4 text-slate-400" />
                </div>
                <select
                  name="userId"
                  value={filters.userId}
                  onChange={handleFilterChange}
                  className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                >
                  <option value="">Tümü</option>
                  {users.map((u: any) => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Başlangıç</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="date"
                name="dateStart"
                value={filters.dateStart}
                onChange={handleFilterChange}
                className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bitiş</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="date"
                name="dateEnd"
                value={filters.dateEnd}
                onChange={handleFilterChange}
                className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm md:col-span-1"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtrele
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-6 print:block print:gap-0">
        {/* İstatistik Grafiği Alanı */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
            {session?.user?.role === 'personnel' ? 'Kendi İşlem İstatistiğiniz (Son 7 Gün)' : 'Genel İşlem İstatistiği (Son 7 Gün)'}
          </h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="dateString" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }} 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                />
                <Bar dataKey="count" name="Yapılan İşlem" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tablo Alanı */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:overflow-visible print:border-none print:shadow-none">
          <div ref={reportRef} className="p-8 bg-white min-w-[800px] print:min-w-0 print:w-full print:p-0">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Vakıf İşlemleri Raporu</h2>
              <p className="text-slate-500 mt-1">Oluşturulma Tarihi: {format(new Date(), "dd MMMM yyyy HH:mm", { locale: tr })}</p>
            </div>
            
            {loading ? (
              <div className="py-12 text-center text-slate-500">Yükleniyor...</div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center text-slate-500">Kayıt bulunamadı.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="py-3 px-4 font-semibold text-slate-700 text-sm w-32">Tarih / Saat</th>
                    {session?.user?.role !== "personnel" && (
                      <th className="py-3 px-4 font-semibold text-slate-700 text-sm w-48">Personel</th>
                    )}
                    <th className="py-3 px-4 font-semibold text-slate-700 text-sm w-1/4">Vatandaş Bilgisi</th>
                    <th className="py-3 px-4 font-semibold text-slate-700 text-sm">Tür</th>
                    <th className="py-3 px-4 font-semibold text-slate-700 text-sm">Yapılan İşlem</th>
                    {session?.user?.role === "superadmin" && (
                      <th className="py-3 px-4 font-semibold text-slate-700 text-sm text-right print:hidden">İşlem</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t: any) => (
                    <tr key={t._id} className="even:bg-slate-50/70 odd:bg-white hover:bg-slate-100 transition-colors">
                      <td className="py-4 px-4 text-sm text-slate-600 whitespace-nowrap align-top border-t border-slate-100">
                        {format(new Date(t.createdAt), "dd/MM/yyyy HH:mm")}
                      </td>
                      {session?.user?.role !== "personnel" && (
                        <td className="py-4 px-4 text-sm text-slate-800 font-medium align-top border-t border-slate-100">
                          {t.userId?.name}
                        </td>
                      )}
                      <td className="py-4 px-4 text-sm text-slate-800 font-medium align-top border-t border-slate-100 print:whitespace-normal print:break-words">
                        {t.citizenInfo}
                      </td>
                      <td className="py-4 px-4 text-sm align-top border-t border-slate-100">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {t.helpType?.name || "-"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-600 whitespace-pre-wrap align-top border-t border-slate-100 print:whitespace-pre-wrap print:break-words">
                        {t.actionTaken}
                      </td>
                      {session?.user?.role === "superadmin" && (
                        <td className="py-4 px-4 text-sm align-top text-right border-t border-slate-100 print:hidden">
                          <button onClick={() => handleDelete(t._id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" title="Sil">
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
    </div>
  );
}
