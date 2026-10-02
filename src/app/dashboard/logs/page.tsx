"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Filter, Search, Calendar, User as UserIcon, Activity } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

export default function LogsPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Varsayılan olarak bugünü göster
  const today = new Date().toISOString().split('T')[0];

  const [filters, setFilters] = useState({
    userId: "",
    dateStart: today,
    dateEnd: today,
    search: "",
  });

  useEffect(() => {
    if (session?.user?.role === "superadmin") {
      fetchUsers();
      fetchLogs();
    }
  }, [session]);

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

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.userId) params.append("userId", filters.userId);
      if (filters.search) params.append("search", filters.search);
      
      if (filters.dateStart) {
        params.append("dateStart", new Date(filters.dateStart).toISOString());
      }
      
      if (filters.dateEnd) {
        const endDate = new Date(filters.dateEnd);
        endDate.setHours(23, 59, 59, 999);
        params.append("dateEnd", endDate.toISOString());
      }

      const res = await fetch(`/api/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error("Loglar yüklenemedi", error);
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
    fetchLogs();
  };

  if (session?.user?.role !== "superadmin") {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center text-slate-500">Bu sayfayı görüntüleme yetkiniz yok.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sistem Logları</h1>
          <p className="text-slate-500 text-sm mt-1">Sistemdeki tüm personel hareketlerini ve aktiviteleri takip edin.</p>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
          
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Arama</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                name="search"
                placeholder="İşlem arayın"
                value={filters.search}
                onChange={handleFilterChange}
                className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

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
                  <option key={u._id} value={u._id}>{u.name} ({u.role === 'manager' ? 'Müdür' : 'Personel'})</option>
                ))}
              </select>
            </div>
          </div>

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
            Uygula
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-blue-600" />
            Aktivite Kayıtları
          </h2>
          <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
            Toplam: {logs.length} İşlem
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Tarih / Saat</th>
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Personel</th>
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Eylem</th>
                <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">Yükleniyor...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">Belirtilen tarihte veya filtrede kayıt bulunamadı.</td>
                </tr>
              ) : (
                logs.map((log: any) => (
                  <tr key={log._id} className="even:bg-slate-50/70 odd:bg-white hover:bg-slate-100 transition-colors">
                    <td className="py-3 px-6 text-sm text-slate-500 whitespace-nowrap border-t border-slate-100">
                      {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss")}
                    </td>
                    <td className="py-3 px-6 text-sm font-medium text-slate-800 border-t border-slate-100">
                      {log.userId?.name || "Bilinmiyor"}
                    </td>
                    <td className="py-3 px-6 text-sm border-t border-slate-100">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        log.action.includes('Sildi') ? 'bg-red-100 text-red-800' :
                        log.action.includes('Eklendi') ? 'bg-green-100 text-green-800' :
                        log.action.includes('Düzenlendi') ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-sm text-slate-600 border-t border-slate-100">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
