"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Save,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { PERMISSION_MODULES, type PermissionModuleKey } from "@/lib/permissionModules";
import { turkishIncludes } from "@/lib/turkish";

interface UserPermission {
  _id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  canManageApplications: boolean;
  authorizedModules: PermissionModuleKey[];
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "superadmin";

  const [loading, setLoading] = useState(false);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);

  const [userList, setUserList] = useState<UserPermission[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [permFilter, setPermFilter] = useState<"all" | "authorized" | "unauthorized">("all");
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const fetchUserPermissions = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/settings/permissions");
      if (res.ok) {
        const data = await res.json();
        const list: UserPermission[] = data.users || [];
        setUserList(list);
        const drafts: Record<string, string> = {};
        list.forEach((u) => {
          drafts[u._id] = u.title || "";
        });
        setTitleDrafts(drafts);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      fetch("/api/settings/system")
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.googleLoginEnabled === "boolean") {
            setGoogleLoginEnabled(data.googleLoginEnabled);
          }
        })
        .catch(() => {});
      fetchUserPermissions();
    }
  }, [isSuperAdmin, fetchUserPermissions]);

  const handleSaveUserTitle = async (userId: string) => {
    setSavingTitleId(userId);
    try {
      const nextTitle = (titleDrafts[userId] || "").trim();
      const res = await fetch("/api/settings/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title: nextTitle }),
      });
      if (res.ok) {
        toast.success("Personel görevi kaydedildi.");
        setUserList((prev) =>
          prev.map((u) => (u._id === userId ? { ...u, title: nextTitle } : u))
        );
      } else {
        const err = await res.json();
        toast.error(err.error || "Görev kaydedilemedi.");
      }
    } catch {
      toast.error("Bağlantı hatası");
    } finally {
      setSavingTitleId(null);
    }
  };

  const handleUpdateUserModules = async (
    userId: string,
    nextModules: PermissionModuleKey[]
  ) => {
    setTogglingUserId(userId);
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, authorizedModules: nextModules }),
      });
      if (res.ok) {
        toast.success("Kullanıcı sayfa yetkileri güncellendi.");
        setUserList((prev) =>
          prev.map((u) =>
            u._id === userId
              ? {
                  ...u,
                  authorizedModules: nextModules,
                  canManageApplications: nextModules.length > 0,
                }
              : u
          )
        );
      } else {
        const data = await res.json();
        toast.error(data.error || "Yetki güncellenemedi.");
      }
    } catch {
      toast.error("Bir hata oluştu.");
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleToggleSingleModule = (
    user: UserPermission,
    moduleKey: PermissionModuleKey
  ) => {
    const current = user.authorizedModules || [];
    const exists = current.includes(moduleKey);
    const next = exists
      ? current.filter((k) => k !== moduleKey)
      : [...current, moduleKey];
    handleUpdateUserModules(user._id, next);
  };

  const handleToggleAllModules = (user: UserPermission) => {
    const allKeys = PERMISSION_MODULES.map((m) => m.key);
    const hasAll = allKeys.every((k) => (user.authorizedModules || []).includes(k));
    handleUpdateUserModules(user._id, hasAll ? [] : allKeys);
  };

  const handleSystemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSystem(true);

    try {
      const res = await fetch("/api/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleLoginEnabled }),
      });

      if (res.ok) {
        toast.success("Sistem ayarları güncellendi!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Güncelleme başarısız");
      }
    } catch {
      toast.error("Bir hata oluştu");
    } finally {
      setSavingSystem(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswords((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error("Yeni şifreler eşleşmiyor!");
      setLoading(false);
      return;
    }

    if (passwords.newPassword.length < 6) {
      toast.error("Şifre en az 6 karakter olmalıdır!");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });

      if (res.ok) {
        toast.success("Şifreniz başarıyla güncellendi!");
        setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        const data = await res.json();
        toast.error(data.error || "Şifre güncellenemedi");
      }
    } catch {
      toast.error("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const authorizedCount = useMemo(
    () => userList.filter((u) => (u.authorizedModules || []).length > 0).length,
    [userList]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim();
    return userList.filter((u) => {
      const hasMods = (u.authorizedModules || []).length > 0;
      if (permFilter === "authorized" && !hasMods) return false;
      if (permFilter === "unauthorized" && hasMods) return false;
      if (!q) return true;
      return (
        turkishIncludes(u.name || "", q) ||
        turkishIncludes(u.email || "", q) ||
        turkishIncludes(u.title || "", q)
      );
    });
  }, [userList, userSearch, permFilter]);

  return (
    <div className={`space-y-6 mx-auto ${isSuperAdmin ? "max-w-5xl" : "max-w-2xl"}`}>
      {/* Sayfa Başlığı */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 flex items-center gap-4">
        <div className="p-3.5 bg-gradient-to-tr from-slate-800 to-slate-700 text-white rounded-2xl shadow-md">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Ayarlar</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isSuperAdmin
              ? "Sistem güvenliğini, personel sayfa yetkilerini ve hesap şifrenizi tek yerden yönetin."
              : "Hesap ayarlarınızı ve şifre işlemlerinizi buradan yönetebilirsiniz."}
          </p>
        </div>
      </div>

      {/* Üst Kartlar: Sistem Ayarları + Şifre İşlemleri */}
      <div className={`grid gap-6 ${isSuperAdmin ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
        {isSuperAdmin && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center">
                <ShieldCheck className="w-5 h-5 mr-2 text-red-600" />
                Sistem Ayarları
              </h2>
              <p className="text-xs text-slate-500 mb-5 pb-4 border-b border-slate-100">
                Yalnızca Süper Admin tarafından değiştirilebilen genel güvenlik tercihleri.
              </p>

              <form id="system-settings-form" onSubmit={handleSystemSubmit} className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-4 border border-slate-200 rounded-2xl bg-slate-50">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Google İle Giriş</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Personellerin sisteme girişte Google hesabı doğrulamasını zorunlu kılar.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={googleLoginEnabled}
                      onChange={(e) => setGoogleLoginEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </form>
            </div>

            <div className="pt-5 mt-5 border-t border-slate-100">
              <button
                type="submit"
                form="system-settings-form"
                disabled={savingSystem}
                className="w-full sm:w-auto flex items-center justify-center px-5 py-2.5 rounded-xl shadow-sm text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-70"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingSystem ? "Kaydediliyor..." : "Sistem Ayarlarını Kaydet"}
              </button>
            </div>
          </div>
        )}

        {/* Şifre İşlemleri Kartı */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center">
            <KeyRound className="w-5 h-5 mr-2 text-blue-600" />
            Şifre İşlemleri
          </h2>
          <p className="text-xs text-slate-500 mb-5 pb-4 border-b border-slate-100">
            Mevcut şifrenizi doğrulayarak yeni giriş şifresi belirleyin.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mevcut Şifre
              </label>
              <input
                type="password"
                name="currentPassword"
                required
                value={passwords.currentPassword}
                onChange={handleChange}
                className="block w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Yeni Şifre
                </label>
                <input
                  type="password"
                  name="newPassword"
                  required
                  value={passwords.newPassword}
                  onChange={handleChange}
                  className="block w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Yeni Şifre (Tekrar)
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  required
                  value={passwords.confirmPassword}
                  onChange={handleChange}
                  className="block w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto flex items-center justify-center px-5 py-2.5 rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-70"
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? "Güncelleniyor..." : "Şifreyi Güncelle"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Alt Bölüm: Sayfa Bazlı Yetkili Personel Belirleme */}
      {isSuperAdmin && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center">
                <UserCheck className="w-5 h-5 mr-2 text-emerald-600" />
                Yetkili Personel Belirleme (Sayfa Bazlı Yetki)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Kullanıcı satırından yetki verilecek sayfaları tek tek seçebilir veya tüm sayfalarda yetkilendirebilirsiniz.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPermFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  permFilter === "all"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Tümü ({userList.length})
              </button>
              <button
                type="button"
                onClick={() => setPermFilter("authorized")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  permFilter === "authorized"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                Yetkili ({authorizedCount})
              </button>
              <button
                type="button"
                onClick={() => setPermFilter("unauthorized")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  permFilter === "unauthorized"
                    ? "bg-amber-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Yetkisiz ({Math.max(0, userList.length - authorizedCount)})
              </button>
            </div>
          </div>

          {/* Arama Kutusu */}
          <div className="mt-4 mb-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Personel adı veya e-posta adresi ile ara..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          {loadingUsers ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              Kullanıcılar yükleniyor...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Eşleşen personel veya müdür bulunamadı.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {filteredUsers.map((u) => {
                const mods = u.authorizedModules || [];
                const hasAll = PERMISSION_MODULES.every((m) => mods.includes(m.key));
                const isBusy = togglingUserId === u._id;
                const isExpanded = expandedUserId === u._id;
                const activeLabels = PERMISSION_MODULES.filter((m) => mods.includes(m.key));

                return (
                  <div key={u._id} className="bg-white hover:bg-slate-50/60 transition-colors">
                    <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0">
                          {u.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-900 text-sm">{u.name}</p>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                u.role === "manager"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {u.role === "manager" ? "Müdür" : "Personel"}
                            </span>
                            {mods.length > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {hasAll
                                  ? "Tüm Sayfalar"
                                  : `${mods.length}/${PERMISSION_MODULES.length} Sayfa`}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-mono truncate">{u.email}</p>

                          {/* Personel Görevi Girişi (Süper Admin) */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={titleDrafts[u._id] ?? u.title ?? ""}
                              onChange={(e) =>
                                setTitleDrafts((prev) => ({ ...prev, [u._id]: e.target.value }))
                              }
                              placeholder="Personel Görevi (Örn: Büro Görevlisi)"
                              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[210px] sm:min-w-[250px]"
                            />
                            <button
                              type="button"
                              disabled={savingTitleId === u._id}
                              onClick={() => handleSaveUserTitle(u._id)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              {savingTitleId === u._id ? "..." : "Görevi Kaydet"}
                            </button>
                          </div>

                          {/* Aktif Sayfa Özet Etiketleri */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {activeLabels.length === 0 ? (
                              <span className="text-[11px] text-slate-400">
                                Tanımlı ek sayfa yetkisi yok
                              </span>
                            ) : (
                              activeLabels.map((m) => (
                                <span
                                  key={m.key}
                                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                >
                                  {m.label}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setExpandedUserId(isExpanded ? null : u._id)}
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5"
                        >
                          Sayfaları Seç
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleAllModules(u)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 ${
                            hasAll
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {hasAll ? "Tümünü Kaldır" : "Tümünü Yetkilendir"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 bg-slate-50/80 border-t border-slate-100">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          {PERMISSION_MODULES.map((mod) => {
                            const active = mods.includes(mod.key);
                            return (
                              <button
                                key={mod.key}
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleToggleSingleModule(u, mod.key)}
                                className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-2 text-left disabled:opacity-60 ${
                                  active
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs"
                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                <span
                                  className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                                    active
                                      ? "bg-emerald-600 border-emerald-600 text-white"
                                      : "bg-slate-50 border-slate-300"
                                  }`}
                                >
                                  {active && <CheckCircle2 className="w-3 h-3" />}
                                </span>
                                <span className="truncate">{mod.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
