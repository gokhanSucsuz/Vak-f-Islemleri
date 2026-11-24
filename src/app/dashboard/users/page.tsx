"use client";

import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import {
  UserPlus,
  Shield,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Copy,
  KeyRound,
  Check,
  X,
  Search,
  Users,
} from "lucide-react";

interface StaffMember {
  _id: string;
  name: string;
  email: string;
  role: "personnel" | "manager";
  passwordVisible?: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");

  // Şifre görünürlük durumları
  const [showAllPasswords, setShowAllPasswords] = useState(false);
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>({});

  // Satır içi şifre güncelleme durumu
  const [editingPwdUserId, setEditingPwdUserId] = useState<string | null>(null);
  const [newPwdValue, setNewPwdValue] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "personnel",
  });

  useEffect(() => {
    void fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Personel başarıyla oluşturuldu!");
        setFormData({ name: "", email: "", password: "", role: "personnel" });
        void fetchUsers();
      } else {
        toast.error(data.error || "Bir hata oluştu");
      }
    } catch {
      toast.error("Personel oluşturulamadı");
    } finally {
      setLoading(false);
    }
  };

  const toggleRowPassword = (id: string) => {
    setVisibleMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyPassword = async (pwd: string, userName: string) => {
    try {
      await navigator.clipboard.writeText(pwd);
      toast.success(`${userName} şifresi panoya kopyalandı.`);
    } catch {
      toast.error("Şifre kopyalanamadı.");
    }
  };

  const handleSaveUserPassword = async (userId: string) => {
    const clean = newPwdValue.trim();
    if (clean.length < 6) {
      toast.error("Şifre en az 6 karakter olmalıdır.");
      return;
    }
    setSavingPwd(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newPassword: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Şifre güncellenemedi.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, passwordVisible: clean } : u))
      );
      setEditingPwdUserId(null);
      setNewPwdValue("");
      toast.success("Personel aktif şifresi güncellendi.");
    } catch {
      toast.error("Şifre güncellenirken hata oluştu.");
    } finally {
      setSavingPwd(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLocaleLowerCase("tr-TR").includes(q) ||
        u.email.toLocaleLowerCase("tr-TR").includes(q)
    );
  }, [users, search]);

  return (
    <div className="space-y-6">
      {/* Üst Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-blue-600" />
            Personel ve Şifre Yönetimi
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Personel ve müdür hesaplarını oluşturun, aktif şifrelerini görüntüleyin veya güncelleyin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAllPasswords((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-bold text-slate-700 shadow-xs transition-colors self-start sm:self-auto"
        >
          {showAllPasswords ? (
            <>
              <EyeOff className="w-4 h-4 text-slate-500" />
              Tüm Şifreleri Gizle
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 text-blue-600" />
              Tüm Aktif Şifreleri Göster
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol: Yeni Personel Ekleme Kartı */}
        <div className="lg:col-span-1">
          <div className="gov-card rounded-3xl p-6">
            <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Yeni Personel Ekle
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="staff-name"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Ad Soyad
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="staff-name"
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/70 focus:bg-white focus:border-blue-600 transition-colors"
                    placeholder="Ahmet Yılmaz"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="staff-email"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  E-posta
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="staff-email"
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/70 focus:bg-white focus:border-blue-600 transition-colors"
                    placeholder="personel@kurum.local"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Başlangıç Şifresi (En az 6 karakter)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="staff-password"
                    type="text"
                    name="password"
                    required
                    minLength={6}
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/70 focus:bg-white focus:border-blue-600 transition-colors font-mono"
                    placeholder="Belirlenen Şifre"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="staff-role"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Yetki Rolü
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Shield className="h-4 w-4 text-slate-400" />
                  </div>
                  <select
                    id="staff-role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/70 focus:bg-white focus:border-blue-600 transition-colors"
                  >
                    <option value="personnel">Personel</option>
                    <option value="manager">Müdür</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-70"
              >
                <UserPlus className="w-4 h-4" />
                {loading ? "Ekleniyor..." : "Personeli Kaydet"}
              </button>
            </form>
          </div>
        </div>

        {/* Sağ: Mevcut Personeller & Aktif Şifreler Tablosu */}
        <div className="lg:col-span-2">
          <div className="gov-card rounded-3xl overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  Mevcut Personeller ({filteredUsers.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aktif şifreler veritabanında AES-256-GCM ile şifreli saklanır ve yalnızca Süper Admin&apos;e gösterilir.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ad veya e-posta ara..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 outline-none"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Aramayı temizle"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/80">
                    <th scope="col" className="py-3.5 px-5 font-bold text-slate-600 text-xs uppercase tracking-wider">
                      Ad Soyad
                    </th>
                    <th scope="col" className="py-3.5 px-5 font-bold text-slate-600 text-xs uppercase tracking-wider">
                      E-posta
                    </th>
                    <th scope="col" className="py-3.5 px-4 font-bold text-slate-600 text-xs uppercase tracking-wider">
                      Rol
                    </th>
                    <th scope="col" className="py-3.5 px-5 font-bold text-slate-600 text-xs uppercase tracking-wider">
                      Aktif Şifre
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fetching ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-500 text-sm">
                        Personel listesi yükleniyor...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-500 text-sm">
                        Personel kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isShown = showAllPasswords || Boolean(visibleMap[u._id]);
                      const hasVisiblePwd = Boolean(u.passwordVisible && u.passwordVisible.trim());
                      const isEditingPwd = editingPwdUserId === u._id;

                      return (
                        <tr
                          key={u._id}
                          className="even:bg-slate-50/50 odd:bg-white hover:bg-blue-50/30 transition-colors"
                        >
                          <td className="py-3.5 px-5 text-sm text-slate-900 font-semibold">
                            {u.name}
                          </td>
                          <td className="py-3.5 px-5 text-xs sm:text-sm text-slate-600">
                            {u.email}
                          </td>
                          <td className="py-3.5 px-4 text-sm">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                u.role === "manager"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {u.role === "manager" ? "Müdür" : "Personel"}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-sm">
                            {isEditingPwd ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={newPwdValue}
                                  onChange={(e) => setNewPwdValue(e.target.value)}
                                  placeholder="Yeni şifre (min 6)"
                                  className="w-36 px-2.5 py-1.5 border border-blue-400 rounded-lg text-xs font-mono bg-white focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  disabled={savingPwd}
                                  onClick={() => handleSaveUserPassword(u._id)}
                                  aria-label="Yeni şifreyi kaydet"
                                  className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={savingPwd}
                                  onClick={() => {
                                    setEditingPwdUserId(null);
                                    setNewPwdValue("");
                                  }}
                                  aria-label="İptal"
                                  className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                {hasVisiblePwd ? (
                                  <>
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-xs font-semibold text-slate-800 select-all">
                                      {isShown ? u.passwordVisible : "••••••••"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleRowPassword(u._id)}
                                      aria-label={isShown ? "Şifreyi gizle" : "Şifreyi göster"}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                      title={isShown ? "Gizle" : "Göster"}
                                    >
                                      {isShown ? (
                                        <EyeOff className="w-4 h-4" />
                                      ) : (
                                        <Eye className="w-4 h-4" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyPassword(u.passwordVisible!, u.name)
                                      }
                                      aria-label="Şifreyi kopyala"
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                      title="Şifreyi Kopyala"
                                    >
                                      <Copy className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800"
                                    title="Personel bir sonraki girişini yaptığında veya buradan şifre belirlediğinizde aktif şifresi görünür olur."
                                  >
                                    İlk giriş bekleniyor
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPwdUserId(u._id);
                                    setNewPwdValue(u.passwordVisible || "");
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition-colors"
                                  title="Personelin aktif şifresini belirle veya değiştir"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  {hasVisiblePwd ? "Değiştir" : "Belirle"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
