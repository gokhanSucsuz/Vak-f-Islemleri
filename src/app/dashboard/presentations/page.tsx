"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Presentation as PresentationIcon,
  Plus,
  Upload,
  FolderOpen,
  Lock,
  Unlock,
  Download,
  Search,
  Eye,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  Clock,
  Save,
  Sparkles,
} from "lucide-react";
import ModernConfirmDialog from "@/components/ModernConfirmDialog";
import {
  SlideItem,
  PresentationTemplateClient,
  compressImageToJpeg,
  exportSlidesToPptx,
} from "@/lib/presentationClient";

interface MeetingItem {
  _id: string;
  title: string;
  meetingDate: string;
  status: "open" | "closed";
  openedBy?: { name: string };
  closedBy?: { name: string };
  closedAt?: string;
  downloadedAt?: string;
  photosExpireAt?: string;
  photosPurged: boolean;
  photosPurgedAt?: string;
  recordCount: number;
  totalSlides: number;
}

interface PresentationListItem {
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

interface OrderedSlide extends SlideItem {
  key: string;
  presentationId: string;
  slideIndex: number;
  authorName: string;
}

function emptySlide(): SlideItem {
  return {
    fullName: "",
    neighborhood: "",
    photoCount: 1,
    photos: [],
    description: "",
  };
}

/**
 * Tek bir slaydın PowerPoint (4:3) canlı görsel önizleme bileşeni
 */
function SlidePreviewCard({
  slide,
  template,
}: {
  slide: SlideItem;
  template: PresentationTemplateClient | null;
}) {
  const photos = (slide.photos || []).filter(Boolean).slice(0, slide.photoCount || 4);
  const lines = (slide.description || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div
      className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-slate-300 shadow-md select-none bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300"
      style={
        template?.backgroundImageBase64
          ? {
              backgroundImage: `url(${template.backgroundImageBase64})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {/* Sol Üst Fotoğraf Alanı (Slaydın üst yarısı, en-boy oranı korunur) */}
      <div className="absolute left-[3.2%] top-[2.4%] w-[41%] h-[41.6%]">
        {photos.length > 0 ? (
          <div
            className={`w-full h-full grid gap-1.5 ${
              photos.length === 1
                ? "grid-cols-1 grid-rows-1"
                : photos.length === 2
                  ? "grid-cols-2 grid-rows-1"
                  : "grid-cols-2 grid-rows-2"
            }`}
          >
            {photos.map((src, idx) => (
              <div
                key={idx}
                className="w-full h-full bg-white border border-slate-300 shadow-sm p-1 flex items-center justify-center overflow-hidden"
              >
                <img
                  src={src}
                  alt={`Slayt fotoğrafı ${idx + 1}`}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full border-2 border-dashed border-slate-400/50 rounded-lg flex flex-col items-center justify-center text-slate-500/80 bg-white/30">
            <ImageIcon className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">
              {slide.photoCount === 0 ? "Fotoğrafsız Slayt" : "Fotoğraf Alanı"}
            </span>
          </div>
        )}
      </div>

      {/* Sağ Üst Adı Soyadı ve Mahalle Kutusu */}
      <div className="absolute left-[47.5%] top-[15.3%] w-[46.2%] h-[11.5%] bg-gradient-to-b from-white to-slate-100 border border-slate-300 shadow-sm flex flex-col items-center justify-center px-2 text-center">
        <div className="font-bold text-slate-950 text-xs sm:text-sm md:text-base leading-tight truncate w-full">
          {slide.fullName || "Adı Soyadı"}
        </div>
        <div className="font-bold text-slate-900 text-[11px] sm:text-xs md:text-sm leading-tight truncate w-full">
          {slide.neighborhood || "...... Mahallesi"}
        </div>
      </div>

      {/* Ortadan En Alta Kadar Açıklama Alanı */}
      <div className="absolute left-[3.2%] top-[46%] w-[93.6%] h-[50.4%] bg-white border border-slate-200 shadow-sm p-2.5 sm:p-3.5 overflow-y-auto">
        {lines.length > 0 ? (
          <ul className="space-y-0.5 text-slate-900 text-[10px] sm:text-xs leading-snug">
            {lines.map((line, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-slate-700 font-bold shrink-0">➢</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-slate-400 text-xs space-y-1">
            <p>➢ Açıklama maddeleri burada görünecek...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PresentationsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  const isManager = role === "superadmin" || role === "manager";

  const [template, setTemplate] = useState<PresentationTemplateClient | null>(null);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [presentations, setPresentations] = useState<PresentationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Modals
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  // Editör State (Yeni / Düzenle)
  const [editorMode, setEditorMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorMeetingId, setEditorMeetingId] = useState<string>("");
  const [slides, setSlides] = useState<SlideItem[]>([emptySlide()]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [compressingPhotos, setCompressingPhotos] = useState(false);

  // Önizleme Modalı
  const [previewRecord, setPreviewRecord] = useState<{
    title: string;
    slides: SlideItem[];
  } | null>(null);
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);

  // Toplantı Yönetimi / Sıralama / Kapatma / İndirme Modalı
  const [manageMeetingModal, setManageMeetingModal] = useState<{
    meeting: MeetingItem;
    orderedSlides: OrderedSlide[];
  } | null>(null);
  const [loadingMeetingSlides, setLoadingMeetingSlides] = useState(false);
  const [exportingMeeting, setExportingMeeting] = useState(false);

  // Silme Onayı
  const [deleteTarget, setDeleteTarget] = useState<PresentationListItem | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, meetRes] = await Promise.all([
        fetch("/api/presentations/template"),
        fetch("/api/presentations/meetings"),
      ]);
      const tplData = await tplRes.json();
      const meetData = await meetRes.json();

      if (tplRes.ok) setTemplate(tplData.template || null);
      if (meetRes.ok) {
        const list: MeetingItem[] = meetData.meetings || [];
        setMeetings(list);
        setSelectedMeetingId((prev) => {
          if (prev && list.some((m) => m._id === prev)) return prev;
          const openOne = list.find((m) => m.status === "open");
          return openOne?._id || list[0]?._id || "";
        });
      }
    } catch {
      toast.error("Veriler yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPresentations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedMeetingId) params.set("meetingId", selectedMeetingId);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/presentations?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setPresentations(data.presentations || []);
    } catch {
      // sessiz geç
    }
  }, [selectedMeetingId, search]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchPresentations();
  }, [fetchPresentations]);

  const selectedMeeting = meetings.find((m) => m._id === selectedMeetingId) || null;

  // Şablon Yükle
  const handleUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTemplate(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/presentations/template", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Şablon yüklenemedi");
      setTemplate(data.template);
      toast.success("Sunu şablonu başarıyla yüklendi.");
      setIsTemplateModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingTemplate(false);
      e.target.value = "";
    }
  };

  // Toplantı Aç
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingTitle.trim()) return;
    setCreatingMeeting(true);
    try {
      const res = await fetch("/api/presentations/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newMeetingTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toplantı açılamadı");
      toast.success("Yeni toplantı açıldı.");
      setNewMeetingTitle("");
      setIsNewMeetingOpen(false);
      await fetchAll();
      if (data.meeting?._id) setSelectedMeetingId(data.meeting._id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingMeeting(false);
    }
  };

  // Yeni Sunu Başlat
  const handleStartNew = () => {
    const openMeeting =
      (selectedMeeting?.status === "open" ? selectedMeeting : null) ||
      meetings.find((m) => m.status === "open");

    if (!openMeeting) {
      toast.error("Şu anda açık bir toplantı yok. Önce yöneticinin toplantı açması gerekir.");
      return;
    }

    setEditingId(null);
    setEditorMeetingId(openMeeting._id);
    setSlides([emptySlide()]);
    setActiveSlideIdx(0);
    setEditorMode(true);
  };

  // Mevcut Sunuyu Düzenle / Önizle / İndir
  const handleOpenRecord = async (
    item: PresentationListItem,
    mode: "preview" | "edit" | "download"
  ) => {
    try {
      const res = await fetch(`/api/presentations/${item._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sunu alınamadı");
      const loadedSlides: SlideItem[] = data.presentation.slides || [];

      if (mode === "preview") {
        setPreviewRecord({ title: item.summaryTitle, slides: loadedSlides });
        setPreviewSlideIdx(0);
      } else if (mode === "edit") {
        setEditingId(item._id);
        setEditorMeetingId(data.presentation.meetingId);
        setSlides(loadedSlides.length > 0 ? loadedSlides : [emptySlide()]);
        setActiveSlideIdx(0);
        setEditorMode(true);
      } else if (mode === "download") {
        await exportSlidesToPptx({
          slides: loadedSlides,
          fileName: `${item.summaryTitle}.pptx`,
          template,
        });
        toast.success("Sunu (.pptx) indirildi.");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Fotoğraf Sıkıştırma & Ekleme
  const handleSlidePhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const current = slides[activeSlideIdx];
    const maxAllowed = current.photoCount || 1;
    const remaining = Math.max(0, maxAllowed - current.photos.length);
    const toProcess = files.slice(0, remaining || maxAllowed);

    setCompressingPhotos(true);
    try {
      const maxDim = maxAllowed === 1 ? 1150 : 880;
      const compressed = await Promise.all(
        toProcess.map((f) => compressImageToJpeg(f, maxDim, 0.76))
      );
      setSlides((prev) =>
        prev.map((s, idx) => {
          if (idx !== activeSlideIdx) return s;
          const merged =
            s.photos.length >= maxAllowed
              ? compressed.slice(0, maxAllowed)
              : [...s.photos, ...compressed].slice(0, maxAllowed);
          return { ...s, photos: merged };
        })
      );
      toast.success(`${compressed.length} fotoğraf sıkıştırılarak eklendi.`);
    } catch (err: any) {
      toast.error(err.message || "Fotoğraf işlenemedi.");
    } finally {
      setCompressingPhotos(false);
      e.target.value = "";
    }
  };

  const updateCurrentSlide = (patch: Partial<SlideItem>) => {
    setSlides((prev) =>
      prev.map((s, idx) => (idx === activeSlideIdx ? { ...s, ...patch } : s))
    );
  };

  // Kaydet
  const handleSavePresentation = async () => {
    if (slides.some((s) => !s.fullName.trim())) {
      toast.error("Lütfen tüm slayt sayfalarında Adı Soyadı alanını doldurun.");
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/presentations/${editingId}` : "/api/presentations";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: editorMeetingId, slides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sunu kaydedilemedi");

      toast.success(editingId ? "Sunu güncellendi." : "Sunu toplantı klasörüne kaydedildi.");
      setEditorMode(false);
      await fetchAll();
      await fetchPresentations();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Toplantı Yönetimi Modalını Aç (Tüm Slaytları Sıralama / Kapatma / Toplu İndirme)
  const openManageMeeting = async (meeting: MeetingItem) => {
    setLoadingMeetingSlides(true);
    try {
      const res = await fetch(`/api/presentations/meetings/${meeting._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toplantı slaytları alınamadı");
      setManageMeetingModal({
        meeting: data.meeting,
        orderedSlides: data.slides || [],
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingMeetingSlides(false);
    }
  };

  const moveOrderedSlide = (idx: number, dir: -1 | 1) => {
    if (!manageMeetingModal) return;
    const list = [...manageMeetingModal.orderedSlides];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const temp = list[idx];
    list[idx] = list[target];
    list[target] = temp;
    setManageMeetingModal({ ...manageMeetingModal, orderedSlides: list });
  };

  const handleMeetingAction = async (
    action: "reorder" | "close" | "reopen" | "downloadCombined"
  ) => {
    if (!manageMeetingModal) return;
    const { meeting, orderedSlides } = manageMeetingModal;
    const slideOrder = orderedSlides.map((s) => ({
      presentationId: s.presentationId,
      slideIndex: s.slideIndex,
    }));

    if (action === "downloadCombined") {
      if (orderedSlides.length === 0) {
        toast.error("Bu toplantıda indirilecek slayt bulunmuyor.");
        return;
      }
      setExportingMeeting(true);
      try {
        // Sırayı kaydet + indir + 12 saat timer başlat
        await fetch(`/api/presentations/meetings/${meeting._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reorder", slideOrder }),
        });

        await exportSlidesToPptx({
          slides: orderedSlides,
          fileName: `${meeting.title}.pptx`,
          template,
        });

        await fetch(`/api/presentations/meetings/${meeting._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markDownloaded" }),
        });

        toast.success(
          "Toplu toplantı sunusu (.pptx) indirildi. Fotoğraflar 12 saat sonra otomatik silinecek."
        );
        await fetchAll();
        const refreshed = await fetch(`/api/presentations/meetings/${meeting._id}`);
        const refData = await refreshed.json();
        if (refreshed.ok) {
          setManageMeetingModal({
            meeting: refData.meeting,
            orderedSlides: refData.slides || [],
          });
        }
      } catch (err: any) {
        toast.error(err.message || "Toplu sunu indirilemedi.");
      } finally {
        setExportingMeeting(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/presentations/meetings/${meeting._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slideOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "İşlem başarısız");

      toast.success(
        action === "close"
          ? "Toplantı kapatıldı ve slayt sırası kaydedildi."
          : action === "reopen"
            ? "Toplantı tekrar açıldı."
            : "Slayt sıralaması kaydedildi."
      );
      setManageMeetingModal({
        ...manageMeetingModal,
        meeting: { ...meeting, ...data.meeting },
      });
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeletePresentation = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/presentations/${deleteTarget._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Silinemedi");
      toast.success("Sunu kaydı silindi.");
      setDeleteTarget(null);
      await fetchAll();
      await fetchPresentations();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // EDİTÖR GÖRÜNÜMÜ
  if (editorMode) {
    const activeSlide = slides[activeSlideIdx] || emptySlide();
    return (
      <div className="space-y-5 max-w-[1440px] mx-auto">
        {/* Üst Araç Çubuğu */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditorMode(false)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {editingId ? "Sunuyu Düzenle" : "Yeni Sunu Slaytları Hazırla"}
              </h1>
              <p className="text-xs text-slate-500">
                Her kayıt birden fazla sunu sayfası içerebilir • Fotoğraflar otomatik sıkıştırılır
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                exportSlidesToPptx({
                  slides,
                  fileName: `${activeSlide.fullName || "sunu"}.pptx`,
                  template,
                })
              }
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Önizleme İndir (.pptx)
            </button>
            <button
              onClick={handleSavePresentation}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-60 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? "Kaydediliyor..." : "Sisteme Kaydet"}
            </button>
          </div>
        </div>

        {/* Slayt Sayfa Sekmeleri */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-2">
          {slides.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSlideIdx(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                idx === activeSlideIdx
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span>Sayfa {idx + 1}</span>
              {s.fullName && (
                <span className="opacity-80 max-w-[110px] truncate">
                  ({s.fullName})
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => {
              setSlides((prev) => [...prev, emptySlide()]);
              setActiveSlideIdx(slides.length);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Yeni Sayfa Ekle
          </button>
          {slides.length > 1 && (
            <button
              onClick={() => {
                const next = slides.filter((_, i) => i !== activeSlideIdx);
                setSlides(next);
                setActiveSlideIdx(Math.max(0, activeSlideIdx - 1));
              }}
              className="ml-auto px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              Bu Sayfayı Sil
            </button>
          )}
        </div>

        {/* Editör Formu + Canlı Slayt Önizlemesi */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Adı Soyadı <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={activeSlide.fullName}
                onChange={(e) => updateCurrentSlide({ fullName: e.target.value })}
                placeholder="Örn: Ahmet YILMAZ"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mahalle / Köy
              </label>
              <input
                type="text"
                value={activeSlide.neighborhood}
                onChange={(e) => updateCurrentSlide({ neighborhood: e.target.value })}
                placeholder="Örn: Karaağaç Mahallesi"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Slayt Fotoğraf Sayısı
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([0, 1, 2, 4] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() =>
                      updateCurrentSlide({
                        photoCount: cnt,
                        photos: cnt === 0 ? [] : activeSlide.photos.slice(0, cnt),
                      })
                    }
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                      activeSlide.photoCount === cnt
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {cnt === 0 ? "Yok (0)" : `${cnt} Foto`}
                  </button>
                ))}
              </div>
            </div>

            {activeSlide.photoCount > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Fotoğraflar ({activeSlide.photos.length}/{activeSlide.photoCount})
                  </label>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {compressingPhotos ? "Sıkıştırılıyor..." : "Fotoğraf Seç"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple={activeSlide.photoCount > 1}
                      disabled={compressingPhotos}
                      onChange={handleSlidePhotosUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {activeSlide.photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeSlide.photos.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-50 group"
                      >
                        <img
                          src={src}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateCurrentSlide({
                              photos: activeSlide.photos.filter((_, i) => i !== idx),
                            })
                          }
                          className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-90 hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Açıklama Maddeleri (Her satır otomatik ➢ işareti alır)
              </label>
              <textarea
                rows={8}
                value={activeSlide.description}
                onChange={(e) => updateCurrentSlide({ description: e.target.value })}
                placeholder={"Hane durumu ve tespitler...\nSosyal inceleme notları...\nTalep edilen yardım..."}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
              />
            </div>
          </div>

          <div className="xl:col-span-7 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Canlı Slayt Önizlemesi — Sayfa {activeSlideIdx + 1} / {slides.length}
              </span>
              {template && (
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Şablon: {template.fileName}
                </span>
              )}
            </div>
            <SlidePreviewCard slide={activeSlide} template={template} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* Başlık ve Aksiyonlar */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-blue-500/20">
            <PresentationIcon className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Sunular & Toplantı Slaytları
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Toplantı klasörlerine çok sayfalı sunular hazırlayın, sıralayın ve toplu .pptx olarak indirin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isManager && (
            <>
              <button
                onClick={() => setIsTemplateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold transition-colors"
              >
                <Upload className="w-4 h-4" />
                Şablon Yönet
              </button>
              <button
                onClick={() => setIsNewMeetingOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-500/20 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Toplantı Aç
              </button>
            </>
          )}
          <button
            onClick={handleStartNew}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Sunu Hazırla
          </button>
        </div>
      </div>

      {/* Toplantı Slaytları Klasörleri */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-600" />
            Toplantı Slaytları Klasörleri
          </h2>
          {template && (
            <span className="text-xs text-slate-500">
              Aktif Şablon: <strong className="text-slate-700">{template.fileName}</strong>
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-slate-500 py-4">Toplantılar yükleniyor...</div>
        ) : meetings.length === 0 ? (
          <div className="text-sm text-slate-500 bg-slate-50 rounded-2xl p-6 text-center border border-dashed border-slate-200">
            Henüz açılmış toplantı bulunmuyor. Yönetici <strong>Toplantı Aç</strong> butonundan toplantı oluşturabilir.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {meetings.map((m) => {
              const active = m._id === selectedMeetingId;
              return (
                <div
                  key={m._id}
                  onClick={() => setSelectedMeetingId(m._id)}
                  className={`cursor-pointer p-4 rounded-2xl border-2 transition-all ${
                    active
                      ? "border-blue-500 bg-blue-50/40 shadow-sm"
                      : "border-slate-100 bg-slate-50/50 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">
                        {m.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {new Date(m.meetingDate).toLocaleDateString("tr-TR")} •{" "}
                        {m.recordCount} Kayıt • {m.totalSlides} Slayt
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        m.status === "open"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {m.status === "open" ? (
                        <>
                          <Unlock className="w-3 h-3" /> Açık
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" /> Kapalı
                        </>
                      )}
                    </span>
                  </div>

                  {m.downloadedAt && (
                    <div className="mt-2.5 text-[11px] flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      {m.photosPurged ? (
                        <span>Fotoğraflar 12 saat sonrası otomatik silindi.</span>
                      ) : m.photosExpireAt ? (
                        <span>
                          Fotoğraflar{" "}
                          {new Date(m.photosExpireAt).toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          tarihinde silinecek.
                        </span>
                      ) : null}
                    </div>
                  )}

                  {isManager && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openManageMeeting(m);
                        }}
                        disabled={loadingMeetingSlides}
                        className="text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-100/70 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Sırala / Kapat / Toplu İndir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Arama ve Seçili Toplantıdaki Sunular */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">
            {selectedMeeting
              ? `${selectedMeeting.title} — Sunu Kayıtları`
              : "Sunu Kayıtları"}
          </h2>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Adı Soyadı, mahalle veya personel ara..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {presentations.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Bu toplantıda henüz sunu kaydı bulunmuyor.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presentations.map((item) => {
              const canModify =
                isManager ||
                (String(item.createdBy?._id) === String(userId) &&
                  item.meetingStatus === "open");
              return (
                <div
                  key={item._id}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-blue-300 bg-white shadow-sm flex flex-col justify-between gap-3 transition-all"
                >
                  <div className="flex items-start gap-3">
                    {item.firstPhoto ? (
                      <img
                        src={item.firstPhoto}
                        alt="Kapak"
                        className="w-16 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <PresentationIcon className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm line-clamp-2">
                        {item.summaryTitle}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {item.createdBy?.name || "Personel"} •{" "}
                        {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                        {item.slideCount} Sayfa
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                        {item.totalPhotos} Fotoğraf
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenRecord(item, "preview")}
                        title="Önizle"
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenRecord(item, "download")}
                        title=".pptx İndir"
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {canModify && (
                        <>
                          <button
                            onClick={() => handleOpenRecord(item, "edit")}
                            title="Düzenle"
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            title="Sil"
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Şablon Yükleme Modalı (Yönetici) */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Sunu Şablonu Yönet (.pptx / Görsel)
              </h3>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Örnek PowerPoint şablonunuzu (.pptx) veya slayt arka plan görselini (.png/.jpg) yükleyin. Sistem slayt boyutunu ve arka plan tasarımını otomatik çıkarır.
            </p>
            {template && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Mevcut Şablon: {template.fileName}
                </div>
                {template.backgroundImageBase64 && (
                  <img
                    src={template.backgroundImageBase64}
                    alt="Şablon Arka Plan"
                    className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200"
                  />
                )}
              </div>
            )}
            <label className="cursor-pointer w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              <Upload className="w-4 h-4" />
              {uploadingTemplate ? "Yükleniyor..." : "Şablon Dosyası Seç (.pptx / .jpg / .png)"}
              <input
                type="file"
                accept=".pptx,.png,.jpg,.jpeg,.webp"
                disabled={uploadingTemplate}
                onChange={handleUploadTemplate}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* Toplantı Açma Modalı (Yönetici) */}
      {isNewMeetingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateMeeting}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Yeni Toplantı Aç</h3>
              <button
                type="button"
                onClick={() => setIsNewMeetingOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Toplantı Adı
              </label>
              <input
                type="text"
                required
                value={newMeetingTitle}
                onChange={(e) => setNewMeetingTitle(e.target.value)}
                placeholder="Örn: 14.11.2026 Mütevelli Heyeti Toplantısı"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewMeetingOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={creatingMeeting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                {creatingMeeting ? "Açılıyor..." : "Toplantıyı Aç"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Slayt Önizleme Modalı */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {previewRecord.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Sayfa {previewSlideIdx + 1} / {previewRecord.slides.length}
                </p>
              </div>
              <button
                onClick={() => setPreviewRecord(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <SlidePreviewCard
              slide={previewRecord.slides[previewSlideIdx] || emptySlide()}
              template={template}
            />

            <div className="flex items-center justify-between">
              <button
                disabled={previewSlideIdx === 0}
                onClick={() => setPreviewSlideIdx((p) => Math.max(0, p - 1))}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Önceki
              </button>
              <button
                disabled={previewSlideIdx >= previewRecord.slides.length - 1}
                onClick={() =>
                  setPreviewSlideIdx((p) =>
                    Math.min(previewRecord.slides.length - 1, p + 1)
                  )
                }
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-40 flex items-center gap-1"
              >
                Sonraki <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplantı Sıralama, Kapatma ve Toplu İndirme Modalı (Yönetici) */}
      {manageMeetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {manageMeetingModal.meeting.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Toplam {manageMeetingModal.orderedSlides.length} slayt • Yukarı/Aşağı butonları ile sunum sırasını belirleyin
                </p>
              </div>
              <button
                onClick={() => setManageMeetingModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {manageMeetingModal.orderedSlides.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-500">
                  Bu toplantıda henüz slayt yok.
                </div>
              ) : (
                manageMeetingModal.orderedSlides.map((s, idx) => (
                  <div
                    key={s.key}
                    className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      {s.photos?.[0] ? (
                        <img
                          src={s.photos[0]}
                          alt="Thumb"
                          className="w-12 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">
                          {s.fullName}{" "}
                          {s.neighborhood && (
                            <span className="font-normal text-slate-600">
                              — {s.neighborhood}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          Hazırlayan: {s.authorName} • {s.photos.length} Fotoğraf
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => moveOrderedSlide(idx, -1)}
                        disabled={idx === 0}
                        className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                        title="Yukarı Taşı"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveOrderedSlide(idx, 1)}
                        disabled={idx === manageMeetingModal.orderedSlides.length - 1}
                        className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                        title="Aşağı Taşı"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMeetingAction("reorder")}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                >
                  Sıralamayı Kaydet
                </button>
                {manageMeetingModal.meeting.status === "open" ? (
                  <button
                    onClick={() => handleMeetingAction("close")}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Toplantıyı Kapat
                  </button>
                ) : (
                  <button
                    onClick={() => handleMeetingAction("reopen")}
                    className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Toplantıyı Tekrar Aç
                  </button>
                )}
              </div>

              <button
                onClick={() => handleMeetingAction("downloadCombined")}
                disabled={exportingMeeting || manageMeetingModal.orderedSlides.length === 0}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {exportingMeeting
                  ? "Hazırlanıyor..."
                  : "Toplu Slayt Dosyası İndir (.pptx)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Silme Onayı */}
      <ModernConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeletePresentation}
        title="Sunu Kaydını Sil"
        message={`"${deleteTarget?.summaryTitle || ""}" sunu kaydını silmek istediğinizden emin misiniz?`}
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
      />
    </div>
  );
}
