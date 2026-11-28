"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Lock,
  User as UserIcon,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Building2,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/settings/system")
      .then((res) => res.json())
      .then((data) => {
        setGoogleLoginEnabled(Boolean(data.googleLoginEnabled));
        setSettingsLoaded(true);
      })
      .catch(() => {
        setSettingsLoaded(true);
      });
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!settingsLoaded) return;

    const isVerified = session && (session as any).googleVerified;
    const hasRole = session?.user?.role;

    if (hasRole) {
      router.push("/dashboard");
      return;
    }

    if ((!googleLoginEnabled || isVerified) && !hasRole) {
      fetchUsers();
    }
  }, [session, router, settingsLoaded, googleLoginEnabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmail) {
      toast.error("Lütfen bir personel seçin");
      return;
    }

    setLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: selectedEmail,
        password,
        loginType: "personnel",
      });

      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Giriş başarılı, yönlendiriliyorsunuz...");
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      toast.error("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || !settingsLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f3f6fb] gap-3">
        <div className="w-9 h-9 border-3 border-blue-700 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-600">Güvenli oturum hazırlanıyor...</p>
      </div>
    );
  }

  const isGoogleVerified = session && (session as any).googleVerified && !session.user?.role;
  const isGoogleStepRequired = googleLoginEnabled;
  const canSeePersonnelForm = !isGoogleStepRequired || isGoogleVerified;

  return (
    <main className="min-h-screen flex flex-col bg-[#f3f6fb] gov-grid-bg relative">
      {/* Üst Resmi Kurum Şeridi */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#c81e1e] via-[#1d4ed8] to-[#059669]" />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-5">
          {/* Kurum Başlığı */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0b192c] to-[#1e3a5f] text-white shadow-xl shadow-slate-900/20 ring-4 ring-white">
              <Building2 className="w-7 h-7" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Vakıf İşlemleri
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">
                Yönetim ve Evrak Portalı
              </p>
            </div>
          </div>

          {/* Giriş Kartı */}
          <div className="glass-panel rounded-3xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-[#0b192c] to-[#163053] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {canSeePersonnelForm ? (
                  <KeyRound className="w-4 h-4 text-blue-300" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-amber-300" aria-hidden="true" />
                )}
                <span className="text-sm font-bold tracking-tight">
                  {canSeePersonnelForm ? "Personel Oturum Girişi" : "Kurumsal Kimlik Doğrulaması"}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-bold text-emerald-200">
                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                KVKK
              </span>
            </div>

            <div className="p-6 sm:p-7">
              {!canSeePersonnelForm ? (
                <div className="space-y-5">
                  <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl text-amber-900 text-xs sm:text-sm font-medium leading-relaxed">
                    Güvenlik politikası gereği sisteme erişim için önce yetkili kurumsal Google hesabınız ile doğrulama yapmanız gerekmektedir.
                  </div>
                  <button
                    type="button"
                    onClick={() => signIn("google", { callbackUrl: "/login" })}
                    className="w-full flex items-center justify-center gap-3 py-3.5 px-4 border border-slate-300 rounded-xl shadow-sm text-sm font-bold text-slate-800 bg-white hover:bg-slate-50 transition-all active:scale-[0.99]"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Yetkili Kurum Hesabı ile Doğrula
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label
                      className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                      htmlFor="personnel"
                    >
                      Personel Seçimi
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <UserIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </div>
                      <select
                        id="personnel"
                        required
                        className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 bg-slate-50/70 hover:bg-white focus:bg-white focus:border-blue-600 transition-colors appearance-none"
                        value={selectedEmail}
                        onChange={(e) => setSelectedEmail(e.target.value)}
                      >
                        <option value="" disabled>
                          Adınızı seçiniz...
                        </option>
                        {users.map((u: any) => (
                          <option key={u._id} value={u.email}>
                            {u.name} ({u.role === "manager" ? "Müdür" : "Personel"})
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                      htmlFor="password"
                    >
                      Şifre
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </div>
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        className="block w-full pl-10 pr-11 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 bg-slate-50/70 hover:bg-white focus:bg-white focus:border-blue-600 placeholder-slate-400 transition-colors"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        aria-pressed={showPassword}
                        aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl shadow-md shadow-blue-900/15 text-sm font-bold text-white bg-gradient-to-r from-[#0b192c] to-[#1d4ed8] hover:from-[#122642] hover:to-[#1e40af] transition-all disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.99]"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Doğrulanıyor...
                      </>
                    ) : (
                      "Güvenli Giriş Yap"
                    )}
                  </button>
                </form>
              )}

              {/* Yönetici / Süper Admin Giriş Portalı Geçiş Butonu */}
              <div className="mt-5 pt-4 border-t border-slate-200/80">
                <Link
                  href="/sa-login"
                  prefetch={true}
                  className="group w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl bg-slate-900/[0.04] hover:bg-[#0b192c] border border-slate-200/90 hover:border-[#0b192c] text-slate-700 hover:text-white transition-all active:scale-[0.99]"
                >
                  <span className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-bold">
                    <span className="w-7 h-7 rounded-lg bg-red-600/10 group-hover:bg-red-500/20 text-red-700 group-hover:text-red-300 flex items-center justify-center transition-colors shrink-0">
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span>Yönetici Giriş Sayfası (Süper Admin)</span>
                  </span>
                  <ArrowRight
                    className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </div>
          </div>

          {/* Alt Güvenlik Bilgilendirmesi */}
          <footer className="text-center space-y-1">
            <p className="text-[11px] font-semibold text-slate-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              AES-256-GCM Şifreli Veri Güvenliği • 6 Saatlik Oturum Koruması
            </p>
            <p className="text-[11px] text-slate-400">
              Tüm erişim ve işlemler 6698 sayılı KVKK kapsamında kayıt altına alınmaktadır.
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
