"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, KeyRound, Save, ShieldCheck, UserCheck } from "lucide-react";
import { useSession } from "next-auth/react";

interface UserPermission {
  _id: string;
  name: string;
  email: string;
  role: string;
  canManageApplications: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);
  const [userList, setUserList] = useState<UserPermission[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

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
        setUserList(data.users || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.role === "superadmin") {
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
  }, [session, fetchUserPermissions]);

  const handleToggleUserPermission = async (userId: string, currentVal: boolean) => {
    setTogglingUserId(userId);
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, canManageApplications: !currentVal }),
      });
      if (res.ok) {
        toast.success("Genel sistem yetkisi güncellendi.");
        setUserList((prev) =>
          prev.map((u) => (u._id === userId ? { ...u, canManageApplications: !currentVal } : u))
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
    } catch (error) {
      toast.error("Bir hata oluştu");
    } finally {
      setSavingSystem(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswords(prev => ({ ...prev, [name]: value }));
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
    } catch (error) {
      toast.error("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Ayarlar</h1>
        <p className="text-slate-500 text-sm mt-1">Hesap ayarlarınızı ve şifrenizi buradan yönetebilirsiniz.</p>
      </div>

      {session?.user?.role === "superadmin" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-6 md:p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center border-b border-slate-100 pb-4">
              <ShieldCheck className="w-5 h-5 mr-2 text-red-600" />
              Sistem Ayarları (Süper Admin)
            </h2>
            
            <form onSubmit={handleSystemSubmit} className="space-y-5">
              <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Google İle Giriş</h3>
                  <p className="text-xs text-slate-500 mt-1">Personellerin sisteme girişte Google hesabı doğrulamasını zorunlu kılar.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={googleLoginEnabled}
                    onChange={(e) => setGoogleLoginEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSystem}
                  className="flex items-center justify-center px-6 py-3 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all disabled:opacity-70"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {savingSystem ? "Kaydediliyor..." : "Sistem Ayarlarını Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {session?.user?.role === "superadmin" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-6 md:p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
              <UserCheck className="w-5 h-5 mr-2 text-emerald-600" />
              Yetkili Personel Belirleme (Genel Sistem Yetkisi)
            </h2>
            <p className="text-xs text-slate-500 mb-6 pb-4 border-b border-slate-100">
              Yetki verilen personeller; Başvuru Dosyaları, Dilekçe İşlemleri, Sunular, Yardım Türleri, Bebek Maması ve Ayni Yardım dahil tüm Vakıf İşlemleri sisteminde tam yetkili olarak işlem yapabilir.
            </p>

            {loadingUsers ? (
              <div className="py-6 text-center text-slate-500 text-sm">
                Kullanıcılar yükleniyor...
              </div>
            ) : userList.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-sm">
                Yetkilendirilebilecek personel veya müdür bulunamadı.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {userList.map((u) => (
                  <div
                    key={u._id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{u.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{u.email}</p>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          u.role === "manager"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {u.role === "manager" ? "Müdür" : "Personel"}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={togglingUserId === u._id}
                      onClick={() => handleToggleUserPermission(u._id, u.canManageApplications)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 ${
                        u.canManageApplications
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                          : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {u.canManageApplications ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Yetkili (Aktif)
                        </>
                      ) : (
                        "Yetki Ver"
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center border-b border-slate-100 pb-4">
            <KeyRound className="w-5 h-5 mr-2 text-blue-600" />
            Şifre İşlemleri (Şifre Değiştir)
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Mevcut Şifre</label>
              <input
                type="password"
                name="currentPassword"
                required
                value={passwords.currentPassword}
                onChange={handleChange}
                className="block w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Yeni Şifre</label>
              <input
                type="password"
                name="newPassword"
                required
                value={passwords.newPassword}
                onChange={handleChange}
                className="block w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Yeni Şifre (Tekrar)</label>
              <input
                type="password"
                name="confirmPassword"
                required
                value={passwords.confirmPassword}
                onChange={handleChange}
                className="block w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center px-6 py-3 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-70"
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? "Güncelleniyor..." : "Şifreyi Güncelle"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
