"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Save, Trash2 } from "lucide-react";

export default function HelpTypesPage() {
  const { data: session } = useSession();
  const [helpTypes, setHelpTypes] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/help-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        toast.success("Yardım türü eklendi!");
        setName("");
        fetchHelpTypes();
      } else {
        toast.error("Bir hata oluştu");
      }
    } catch (e) {
      toast.error("Kaydedilemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;

    try {
      const res = await fetch(`/api/help-types/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Silindi");
        fetchHelpTypes();
      } else {
        toast.error("Silinemedi");
      }
    } catch (e) {
      toast.error("Bir hata oluştu");
    }
  };

  if (session?.user?.role !== "manager" && session?.user?.role !== "superadmin") {
    return <div className="p-8 text-center">Bu sayfaya erişim yetkiniz yok.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Yardım / Başvuru Türleri</h1>
        <p className="text-slate-500 text-sm mt-1">Personelin işlem kaydederken seçeceği türleri buradan yönetebilirsiniz.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-lg">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yeni tür adı..."
            className="flex-1 p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-70 flex items-center"
          >
            <Save className="w-4 h-4 mr-2" /> Ekle
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="py-3 px-6 font-semibold text-slate-600 text-sm">Tür Adı</th>
              <th className="py-3 px-6 font-semibold text-slate-600 text-sm text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {helpTypes.map((ht: any) => (
              <tr key={ht._id} className="hover:bg-slate-50 transition">
                <td className="py-3 px-6 text-slate-800">{ht.name}</td>
                <td className="py-3 px-6 text-right">
                  <button onClick={() => handleDelete(ht._id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {helpTypes.length === 0 && (
              <tr>
                <td colSpan={2} className="py-8 text-center text-slate-500">Kayıtlı tür bulunmuyor.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
