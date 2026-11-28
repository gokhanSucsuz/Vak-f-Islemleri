"use client";

import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import {
  X,
  Copy,
  Search,
  FolderArchive,
  Presentation as PresentationIcon,
  RefreshCw,
  CheckCircle,
  Calendar,
  User,
  Layers,
} from "lucide-react";

export interface ClosedMeetingOption {
  _id: string;
  title: string;
  meetingDate: string;
  recordCount: number;
}

export interface ClosedPresentationItem {
  _id: string;
  meetingId: string;
  meetingTitle: string;
  meetingStatus: "open" | "closed";
  summaryTitle: string;
  slideCount: number;
  totalPhotos: number;
  firstPhoto: string;
  createdBy?: { _id: string; name: string };
  createdAt: string;
}

interface ImportFromClosedMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMeeting: { _id: string; title: string };
  closedMeetings: ClosedMeetingOption[];
  onSuccess: () => void;
}

export default function ImportFromClosedMeetingModal({
  isOpen,
  onClose,
  activeMeeting,
  closedMeetings,
  onSuccess,
}: ImportFromClosedMeetingModalProps) {
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(
    closedMeetings[0]?._id || ""
  );
  const [presentations, setPresentations] = useState<ClosedPresentationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  // Modal açıldığında veya kapalı toplantı listesi güncellendiğinde ilkini seç
  useEffect(() => {
    if (isOpen) {
      if (!selectedMeetingId && closedMeetings.length > 0) {
        setSelectedMeetingId(closedMeetings[0]._id);
      }
      setSearch("");
    }
  }, [isOpen, closedMeetings, selectedMeetingId]);

  // Seçili kapalı toplantının sunularını getir
  useEffect(() => {
    if (!isOpen || !selectedMeetingId) return;

    let isMounted = true;
    setLoading(true);

    fetch(`/api/presentations?meetingId=${selectedMeetingId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data.presentations)) {
          setPresentations(data.presentations);
        } else {
          setPresentations([]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        toast.error("Toplantı sunuları yüklenirken hata oluştu.");
        setPresentations([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedMeetingId]);

  // Arama filtresi
  const filteredPresentations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return presentations;
    return presentations.filter(
      (p) =>
        p.summaryTitle.toLowerCase().includes(q) ||
        (p.createdBy?.name && p.createdBy.name.toLowerCase().includes(q))
    );
  }, [presentations, search]);

  // Sunuyu kopyala
  const handleCopy = async (item: ClosedPresentationItem) => {
    if (copyingId) return;
    setCopyingId(item._id);
    const toastId = toast.loading(`"${item.summaryTitle}" kopyalanıyor...`);

    try {
      const res = await fetch("/api/presentations/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePresentationId: item._id,
          targetMeetingId: activeMeeting._id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Sunu kopyalanamadı.");
      }

      toast.success(
        `"${item.summaryTitle}" başarıyla aktif toplantıya aktarıldı.`,
        { id: toastId }
      );
      setCopiedIds((prev) => new Set(prev).add(item._id));
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Kopyalama işlemi başarısız.", { id: toastId });
    } finally {
      setCopyingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
        
        {/* Üst Başlık Barı */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30 shrink-0">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate flex items-center gap-2">
                Eski Toplantıdan Sunu Al
              </h2>
              <p className="text-xs text-teal-200/90 truncate">
                Hedef Aktif Toplantı: <strong className="text-white font-bold">{activeMeeting.title}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors shrink-0"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seçim & Arama Filtreleri */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Kapatılmış Toplantı Seçimi */}
          <div className="sm:w-1/2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Kapatılmış Toplantı Dosyası
            </label>
            <select
              value={selectedMeetingId}
              onChange={(e) => setSelectedMeetingId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none shadow-xs"
            >
              {closedMeetings.length === 0 ? (
                <option value="">Kapatılmış toplantı bulunamadı</option>
              ) : (
                closedMeetings.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.title} ({new Date(m.meetingDate).toLocaleDateString("tr-TR")}) — {m.recordCount} Sunu
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Sunu Arama */}
          <div className="sm:w-1/2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Sunu veya Personel Ara
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Başlık veya personel adı..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* Sunu Listesi */}
        <div className="flex-1 min-h-[300px] max-h-[500px] overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
              <span className="text-sm font-medium">Toplantı sunuları yükleniyor...</span>
            </div>
          ) : closedMeetings.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8">
              Sistemde henüz kapatılmış/arşivlenmiş toplantı bulunmuyor.
            </div>
          ) : presentations.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8">
              Bu toplantıda kayıtlı sunu bulunamadı.
            </div>
          ) : filteredPresentations.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8">
              Aramanızla eşleşen sunu bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredPresentations.map((item) => {
                const isCopied = copiedIds.has(item._id);
                const isCurrentCopying = copyingId === item._id;

                return (
                  <div
                    key={item._id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-teal-400 hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative w-20 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                        {item.firstPhoto ? (
                          <img
                            src={item.firstPhoto}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <PresentationIcon className="w-5 h-5" />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white text-[9px] font-extrabold">
                          {item.slideCount} Slayt
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900 text-sm line-clamp-2 leading-tight">
                          {item.summaryTitle}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] text-slate-500">
                          <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {item.createdBy?.name || "Personel"}
                          </span>
                          <span className="flex items-center gap-1 text-slate-400">
                            <Calendar className="w-3 h-3" />
                            {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                      <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        {item.totalPhotos} Fotoğraf
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopy(item)}
                        disabled={isCurrentCopying}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                          isCopied
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                            : "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-600/25"
                        } disabled:opacity-50`}
                      >
                        {isCurrentCopying ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Aktarılıyor...
                          </>
                        ) : isCopied ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Tekrar Kopyala
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Aktif Toplantıya Kopyala
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alt Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Toplam <strong className="text-slate-800">{filteredPresentations.length}</strong> sunu listelendi
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold transition-colors"
          >
            Kapat
          </button>
        </div>

      </div>
    </div>
  );
}
