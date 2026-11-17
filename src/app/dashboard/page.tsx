"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Save, UserCircle, Activity, Clock, Trash2, Edit2, X, Check, AlertTriangle, Search } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { turkishIncludes, extractTC } from "@/lib/turkish";
import ModernConfirmDialog, { DialogType } from "@/components/ModernConfirmDialog";
import PaginationControls from "@/components/PaginationControls";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [formData, setFormData] = useState({
    citizenInfo: "",
    helpType: "",
  });
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [allSearchedTransactions, setAllSearchedTransactions] = useState<any[] | null>(null);
  const [txSearch, setTxSearch] = useState("");
  const [searchingAll, setSearchingAll] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(20);
  const [helpTypes, setHelpTypes] = useState([]);
  const [todayStats, setTodayStats] = useState(0);
  
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    citizenInfo: "",
    helpType: "",
  });

  // Tekrar kayıt uyarı diyalogu
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    type: DialogType;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: null,
    type: "warning",
  });

  const fetchData = async () => {
    if (!session?.user?.id) return;
    try {
      // Son 30 günün tüm personel kayıtlarını çek
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      const params = new URLSearchParams({
        dateStart: thirtyDaysAgo.toISOString(),
        dateEnd: todayEnd.toISOString()
      });

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.transactions || [];
        setTransactions(list);
        const todayStartMs = new Date().setHours(0, 0, 0, 0);
        const todayCount = list.filter((t: any) => new Date(t.createdAt).getTime() >= todayStartMs).length;
        setTodayStats(todayCount);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setTxPage(1);
    const q = txSearch.trim();
    if (!q) {
      setAllSearchedTransactions(null);
      setSearchingAll(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingAll(true);
      try {
        const res = await fetch(`/api/transactions?search=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setAllSearchedTransactions(data.transactions || []);
        }
      } catch {
        /* ignore */
      } finally {
        setSearchingAll(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [txSearch]);

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

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const matchingTodayTransactions = useMemo(() => {
    const raw = formData.citizenInfo.trim();
    if (raw.length < 3) return [];

    const inputTc = extractTC(raw);
    const namePart = raw.replace(/\b\d{11}\b/g, "").replace(/[-–—]/g, " ").trim();

    return transactions.filter((t: any) => {
      const existingInfo = (t.citizenInfo || "").trim();
      if (!existingInfo) return false;

      if (inputTc) {
        const existingTc = extractTC(existingInfo);
        if (existingTc && existingTc === inputTc) return true;
        if (existingInfo.includes(inputTc)) return true;
      }

      if (namePart.length >= 3) {
        if (turkishIncludes(existingInfo, namePart)) return true;
        const existingNamePart = existingInfo.replace(/\b\d{11}\b/g, "").replace(/[-–—]/g, " ").trim();
        if (existingNamePart.length >= 3 && turkishIncludes(namePart, existingNamePart)) {
          return true;
        }
      }

      return turkishIncludes(existingInfo, raw);
    });
  }, [formData.citizenInfo, transactions]);

  const executeSaveTransaction = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success("İşlem başarıyla kaydedildi ve listeye eklendi!");
        setFormData({ citizenInfo: "", helpType: "" });
        if (data?.transaction && !data?.deduplicated) {
          setTransactions((prev: any) =>
            prev.some((item: any) => item._id === data.transaction._id)
              ? prev
              : [data.transaction, ...prev]
          );
          setTodayStats((prev) => prev + 1);
        }
        // Arka planda sessizce senkronize et
        void fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Bir hata oluştu");
      }
    } catch (error) {
      toast.error("İşlem kaydedilemedi");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submittingRef.current) return;
    setLoading(true);

    try {
      const checkRes = await fetch("/api/transactions/check-recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenInfo: formData.citizenInfo }),
      });
      const checkData = checkRes.ok ? await checkRes.json() : { matches: [] };
      const recentMatches =
        Array.isArray(checkData.matches) && checkData.matches.length > 0
          ? checkData.matches
          : matchingTodayTransactions.map((t: any) => ({
              id: t._id,
              source: "İşlem Kaydı",
              citizenInfo: t.citizenInfo,
              detail: t.helpType?.name || "İşlem",
              staffName: t.userId?.name || "Personel",
              createdAt: t.createdAt,
            }));

      if (recentMatches.length > 0) {
        setLoading(false);
        setDialogState({
          isOpen: true,
          type: "warning",
          title: "DİKKAT: Son 1 Ay İçinde Kayıt Bulundu!",
          confirmText: "Onayla ve Devam Et",
          cancelText: "İşlemi İptal Et",
          message: (
            <div className="space-y-3 text-left">
              <p className="text-sm text-amber-800 font-semibold">
                Bu kişiyle eşleşen son 1 ay içinde yapılmış {recentMatches.length} işlem / başvuru kaydı tespit edildi:
              </p>
              <div className="max-h-52 overflow-y-auto space-y-2 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200">
                {recentMatches.map((m: any) => (
                  <div
                    key={m.id}
                    className="text-xs flex flex-col gap-1 bg-white px-3 py-2 rounded-lg border border-amber-100 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 truncate">{m.citizenInfo}</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                        {m.source}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-slate-500">
                      <span className="truncate">{m.detail} • {m.staffName}</span>
                      <span className="whitespace-nowrap font-mono">
                        {format(new Date(m.createdAt), "dd.MM.yyyy HH:mm")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-600">
                Uyarıyı onaylayarak işleme devam edebilir veya vazgeçebilirsiniz.
              </p>
            </div>
          ),
          onConfirm: async () => {
            setDialogState((prev) => ({ ...prev, isOpen: false }));
            await executeSaveTransaction();
          },
        });
        return;
      }
    } catch {
      // Check başarısız olursa kaydetmeye devam et
    }

    await executeSaveTransaction();
  };

  const handleDelete = (id: string) => {
    setDialogState({
      isOpen: true,
      type: "danger",
      title: "İşlem Kaydını Sil",
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
      message: (
        <p className="text-sm text-slate-600">
          Bu işlem kaydını kalıcı olarak silmek istediğinize emin misiniz?
        </p>
      ),
      onConfirm: async () => {
        setDialogState((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
          if (res.ok) {
            toast.success("Kayıt silindi");
            fetchData();
          } else {
            const err = await res.json();
            toast.error(err.error || "Silinemedi");
          }
        } catch {
          toast.error("Bir hata oluştu");
        }
      },
    });
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
      helpType: t.helpType?._id || "",
    });
  };

  const activeTransactionsList = allSearchedTransactions ?? transactions;
  const txTotalPages = Math.max(1, Math.ceil(activeTransactionsList.length / txPageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (txPage - 1) * txPageSize;
    return activeTransactionsList.slice(start, start + txPageSize);
  }, [activeTransactionsList, txPage, txPageSize]);

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
                    className={`block w-full pl-10 pr-3 py-3 border rounded-xl transition-all focus:outline-none focus:ring-2 ${
                      matchingTodayTransactions.length > 0
                        ? "border-amber-400 bg-amber-50/40 focus:bg-white focus:ring-amber-500/30 focus:border-amber-500"
                        : "border-slate-200 bg-slate-50 focus:bg-white focus:ring-blue-500 focus:border-blue-500"
                    }`}
                    placeholder="Örn: Ahmet Yılmaz - 12345678901"
                  />
                </div>
                {matchingTodayTransactions.length > 0 && (
                  <div className="mt-3 p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>
                        UYARI: Son 30 gün içinde bu kişi için {matchingTodayTransactions.length} işlem kaydı bulundu!
                      </span>
                    </div>
                    <div className="space-y-1">
                      {matchingTodayTransactions.slice(0, 4).map((t: any) => (
                        <div
                          key={t._id}
                          className="text-xs bg-white/90 px-3 py-1.5 rounded-lg border border-amber-200 flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="font-semibold text-slate-800 truncate">{t.citizenInfo}</span>
                          <span className="text-slate-600 whitespace-nowrap font-medium">
                            {t.helpType?.name || "-"} • <strong className="text-slate-800">{t.userId?.name || "Personel"}</strong> • {format(new Date(t.createdAt), "dd.MM.yyyy HH:mm")}
                          </span>
                        </div>
                      ))}
                      {matchingTodayTransactions.length > 3 && (
                        <p className="text-[11px] text-amber-700 font-medium pl-1">
                          +{matchingTodayTransactions.length - 3} eşleşen kayıt daha...
                        </p>
                      )}
                    </div>
                  </div>
                )}
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

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex items-center text-sm text-slate-500">
                  <Clock className="w-4 h-4 mr-2" />
                  İşlem saati otomatik kaydedilecektir.
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      İşlem Yapılıyor...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5 mr-2" />
                      Kaydet
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kayıtlar Listesi */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {txSearch.trim() ? "Tüm İşlemlerde Arama Sonuçları" : "Son 30 Günün Personel İşlemleri"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {txSearch.trim()
                ? `${(allSearchedTransactions ?? []).length} eşleşen kayıt bulundu`
                : `Son 30 günde yapılan toplam ${transactions.length} işlem listeleniyor`}
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="Tüm işlemlerde ad soyad, TC veya personel ara..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {txSearch && (
              <button
                type="button"
                onClick={() => setTxSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {/* Mobil Kart Görünümü (md altı ekranlar için %100 uyumlu) */}
        <div className="md:hidden divide-y divide-slate-100">
          {searchingAll ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              Tüm işlemlerde aranıyor...
            </div>
          ) : (allSearchedTransactions ?? transactions).length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              Henüz bir kayıt bulunmamaktadır.
            </div>
          ) : (
            paginatedTransactions.map((t: any) => {
              const isEditing = editingId === t._id;
              const isOwner = String(t.userId?._id || t.userId || "") === String(session?.user?.id || "");
              const canCrud = session?.user?.role === "superadmin" || (session?.user?.role === "personnel" && isOwner);
              const isSearchMatch = txSearch.trim().length > 0;

              return (
                <div
                  key={t._id}
                  className={`p-4 space-y-2.5 ${
                    isSearchMatch ? "bg-amber-50/70" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">
                      {t.userId?.name || "-"}
                    </span>
                    <span className="font-mono">
                      {format(new Date(t.createdAt), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        name="citizenInfo"
                        value={editFormData.citizenInfo}
                        onChange={handleEditChange}
                        className="w-full p-2 border border-blue-300 rounded-lg text-sm"
                      />
                      <select
                        name="helpType"
                        value={editFormData.helpType}
                        onChange={handleEditChange}
                        className="w-full p-2 border border-blue-300 rounded-lg text-sm"
                      >
                        <option value="">Seçiniz...</option>
                        {helpTypes.map((ht: any) => (
                          <option key={ht._id} value={ht._id}>
                            {ht.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-slate-900 break-words">
                      {t.citizenInfo}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-800 break-words">
                      {t.helpType?.name || "-"}
                    </span>

                    {session?.user?.role !== "manager" && (
                      <div>
                        {!canCrud ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            Salt Okunur
                          </span>
                        ) : isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUpdate(t._id)}
                              className="p-1.5 bg-green-100 text-green-700 rounded-lg"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 bg-slate-100 text-slate-600 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => startEditing(t)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(t._id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Masaüstü Tablo Görünümü (Taşmayı engelleyen dengeli sütun genişlikleri) */}
        <div className="hidden md:block w-full">
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="w-36 py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Tarih / Saat</th>
                <th className="w-40 py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Personel</th>
                <th className="py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Vatandaş Bilgisi</th>
                <th className="w-52 py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Tür</th>
                {session?.user?.role !== "manager" && (
                  <th className="w-28 py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">İşlemler</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {searchingAll ? (
                <tr>
                  <td colSpan={session?.user?.role !== "manager" ? 5 : 4} className="py-8 text-center text-slate-500 text-sm">
                    Tüm işlemlerde aranıyor...
                  </td>
                </tr>
              ) : (allSearchedTransactions ?? transactions).length === 0 ? (
                <tr>
                  <td colSpan={session?.user?.role !== "manager" ? 5 : 4} className="py-8 text-center text-slate-500">Henüz bir kayıt bulunmamaktadır.</td>
                </tr>
              ) : (
                paginatedTransactions.map((t: any) => {
                  const isEditing = editingId === t._id;
                  const isOwner = String(t.userId?._id || t.userId || "") === String(session?.user?.id || "");
                  const canCrud = session?.user?.role === "superadmin" || (session?.user?.role === "personnel" && isOwner);
                  const isSearchMatch = txSearch.trim().length > 0;
                  
                  return (
                    <tr key={t._id} className={`${isSearchMatch ? "bg-amber-50/70 hover:bg-amber-100/70" : "even:bg-slate-50/70 odd:bg-white hover:bg-slate-100"} transition-colors`}>
                      <td className="py-3 px-4 text-xs font-mono text-slate-500 align-middle border-t border-slate-100">
                        {format(new Date(t.createdAt), "dd/MM/yyyy HH:mm")}
                      </td>

                      <td className="py-3 px-4 text-xs sm:text-sm text-slate-800 font-semibold align-middle border-t border-slate-100 truncate">
                        {t.userId?.name || "-"}
                      </td>
                      
                      <td className="py-3 px-4 align-middle border-t border-slate-100 break-words">
                        {isEditing ? (
                          <input 
                            type="text" 
                            name="citizenInfo"
                            value={editFormData.citizenInfo}
                            onChange={handleEditChange}
                            className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        ) : (
                          <span className="text-sm font-medium text-slate-800 break-words">{t.citizenInfo}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 align-middle border-t border-slate-100">
                        {isEditing ? (
                          <select
                            name="helpType"
                            value={editFormData.helpType}
                            onChange={handleEditChange}
                            className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            <option value="">Seçiniz...</option>
                            {helpTypes.map((ht: any) => (
                              <option key={ht._id} value={ht._id}>{ht.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-block max-w-full px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-800 leading-snug break-words">
                            {t.helpType?.name || "-"}
                          </span>
                        )}
                      </td>
                      
                      {session?.user?.role !== "manager" && (
                        <td className="py-3 px-4 align-middle text-right border-t border-slate-100">
                          {!canCrud ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                              Salt Okunur
                            </span>
                          ) : isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleUpdate(t._id)} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
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

        <PaginationControls
          currentPage={txPage}
          totalPages={txTotalPages}
          totalRecords={activeTransactionsList.length}
          pageSize={txPageSize}
          onPageChange={setTxPage}
          onPageSizeChange={(s) => {
            setTxPageSize(s);
            setTxPage(1);
          }}
        />
      </div>

      <ModernConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        onConfirm={dialogState.onConfirm}
        onClose={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
