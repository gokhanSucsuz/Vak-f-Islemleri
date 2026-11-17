"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Plus, Trash2, Tag, Search, Layers, X } from "lucide-react";
import { turkishIncludes } from "@/lib/turkish";
import ModernConfirmDialog, { DialogType } from "@/components/ModernConfirmDialog";

export default function HelpTypesPage() {
  const { data: session } = useSession();
  const [helpTypes, setHelpTypes] = useState<Array<{ _id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    type: DialogType;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: null,
    type: "danger",
  });

  useEffect(() => {
    fetchHelpTypes();
  }, []);

  const fetchHelpTypes = async () => {
    try {
      const res = await fetch("/api/help-types");
      if (res.ok) {
        const data = await res.json();
        setHelpTypes(data.helpTypes || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/help-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (res.ok) {
        toast.success("Yardım türü başarıyla eklendi!");
        setName("");
        fetchHelpTypes();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Bir hata oluştu");
      }
    } catch {
      toast.error("Kaydedilemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (ht: { _id: string; name: string }) => {
    setDialogState({
      isOpen: true,
      type: "danger",
      title: "Yardım Türünü Sil",
      message: (
        <p className="text-sm text-slate-600">
          <strong>{ht.name}</strong> yardım türünü silmek istediğinize emin misiniz?
        </p>
      ),
      onConfirm: async () => {
        setDialogState((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/help-types/${ht._id}`, { method: "DELETE" });
          if (res.ok) {
            toast.success("Yardım türü silindi");
            fetchHelpTypes();
          } else {
            toast.error("Silinemedi");
          }
        } catch {
          toast.error("Bir hata oluştu");
        }
      },
    });
  };

  const filteredTypes = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) return helpTypes;
    return helpTypes.filter((ht) => turkishIncludes(ht.name || "", q));
  }, [helpTypes, searchTerm]);

  if (
    session?.user?.role !== "manager" &&
    session?.user?.role !== "superadmin" &&
    !session?.user?.authorizedModules?.includes("helpTypes")
  ) {
    return <div className="p-8 text-center">Bu sayfaya erişim yetkiniz yok.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Üst Başlık ve İstatistik */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl shadow-md shadow-blue-600/20 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Yardım / Başvuru Türleri
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Personelin işlem kaydederken seçeceği yardım türlerini buradan yönetebilirsiniz.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-50 border border-blue-100 text-blue-800 text-xs sm:text-sm font-bold self-start sm:self-auto">
          <Tag className="w-4 h-4 text-blue-600" />
          <span>Toplam {helpTypes.length} Tür</span>
        </div>
      </div>

      {/* Yeni Tür Ekleme ve Arama Alanı */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 flex-1">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yeni yardım / başvuru türü adı..."
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-sm transition-all shrink-0"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Ekleniyor...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Yeni Tür Ekle
              </>
            )}
          </button>
        </form>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Türlerde ara..."
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Ekranı Dolduran Küçük Kartlar Grid Görünümü */}
      {filteredTypes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500 text-sm">
          {searchTerm ? "Aramanızla eşleşen yardım türü bulunamadı." : "Henüz kayıtlı yardım türü bulunmuyor."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredTypes.map((ht) => (
            <div
              key={ht._id}
              className="group bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-800 leading-snug break-words line-clamp-2">
                  {ht.name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(ht)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                title="Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ModernConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
        onConfirm={dialogState.onConfirm}
        onClose={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
