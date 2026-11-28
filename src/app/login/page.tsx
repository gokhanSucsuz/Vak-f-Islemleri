"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Lock,
  Users,
  ShieldCheck,
  Shield,
  Eye,
  EyeOff,
  ChevronDown,
  ArrowRight,
  Landmark,
  FolderOpen,
  Presentation,
  ScrollText,
  CheckCircle2,
  Loader2,
} from "lucide-react";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<any[]>([]);
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
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white gap-2.5 text-xs font-bold uppercase tracking-wider">
        <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
        <span>Güvenli Oturum Hazırlanıyor...</span>
      </div>
    );
  }

  const isGoogleVerified = session && (session as any).googleVerified && !session.user?.role;
  const isGoogleStepRequired = googleLoginEnabled;
  const canSeePersonnelForm = !isGoogleStepRequired || isGoogleVerified;

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 p-4 sm:p-6 relative overflow-hidden">
      {/* Subtle GovTech Background Grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.28) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="w-full max-w-5xl relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-800/30 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT 5 COLUMNS: OFFICIAL INSTITUTION BRANDING & CAPABILITIES */}
          <div className="lg:col-span-5 bg-slate-950 text-white p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
            <div className="space-y-6">
              {/* Logo & Institution Name */}
              <div className="flex items-center gap-3.5">
                <img
                  src="/logo-sydv.jpg"
                  alt="T.C. SYDV Logo"
                  className="w-14 h-14 rounded-xl object-cover ring-2 ring-amber-400/60 shadow-lg shrink-0"
                />
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block">
                    T.C. Valilik / Kaymakamlık
                  </span>
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-white uppercase leading-snug">
                    Sosyal Yardımlaşma ve Dayanışma Vakfı
                  </h1>
                </div>
              </div>

              {/* Official Description */}
              <div className="pt-4 border-t border-slate-800/90 space-y-2.5">
                <div className="inline-flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[10px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wider">
                  <Landmark className="w-3.5 h-3.5 text-amber-400" />
                  <span>Vakıf İşlemleri ve Evrak Yönetim Sistemi</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  Sosyal yardım başvuru dosyalarının takibi, matbu ve detaylı dilekçe üretimi, Mütevelli Heyeti toplantı sunularının hazırlanması ve ayni yardım kayıtları için yetkilendirilmiş kurumsal çalışma alanı.
                </p>
              </div>

              {/* Key System Capabilities List */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-2.5 text-xs text-slate-300">
                  <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Başvuru Dosyası & Yardım Takibi:</strong> Hane başvuru dosyalarını, bebek maması ve ayni yardım teslimatlarını tek merkezden anlık yönetme.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-300">
                  <Presentation className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Heyet Sunu Stüdyosu:</strong> Toplantı slaytlarını canlı önizleme, tam ekran projeksiyon gösterisi ve tek tıkla sıkıştırılmış PowerPoint (.pptx) birleştirme.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-300">
                  <ScrollText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Resmi Dilekçe & İstatistik:</strong> Kurumsal Word (.docx) dilekçe şablonlarıyla evrak üretimi ve detaylı Excel/PDF raporlama.
                  </span>
                </div>
              </div>
            </div>

            {/* Security Footer */}
            <div className="mt-8 pt-4 border-t border-slate-800/90 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                AES-256-GCM Şifreli Veri
              </span>
              <span>•</span>
              <span>6698 KVKK & Denetim İzi</span>
            </div>
          </div>

          {/* RIGHT 7 COLUMNS: CLEAN PROFESSIONAL ACCESS PORTAL */}
          <div className="lg:col-span-7 p-6 sm:p-8 bg-white flex flex-col justify-between space-y-6">
            <div>
              {/* Top Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 uppercase tracking-tight">
                    Kurumsal Oturum Açma
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Vakıf işlemleri, dilekçe ve sunu modüllerine devam etmek için giriş yapınız.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-full border border-slate-200 uppercase shrink-0">
                  <Lock className="w-3 h-3 text-blue-700" />
                  Yetkili Erişim
                </span>
              </div>

              {/* Primary Personnel Access Card */}
              <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 uppercase">
                        Vakıf Personeli Girişi
                      </h3>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded uppercase">
                        Evrak, Sunu & Yardım
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {!canSeePersonnelForm
                        ? "Güvenlik politikası gereği personel seçimine geçmek için önce yetkili kurum Google hesabınız ile doğrulama yapınız."
                        : "Listeden adınızı seçip kişisel personel şifrenizi girerek çalışma alanınızı açın."}
                    </p>
                  </div>
                </div>

                {!canSeePersonnelForm ? (
                  <button
                    type="button"
                    onClick={() => signIn("google", { callbackUrl: "/login" })}
                    className="w-full flex items-center justify-center gap-2.5 bg-blue-700 hover:bg-blue-800 text-white px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-[0.99]"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Kurumsal Google Hesabı İle Doğrula</span>
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </button>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
                    <div>
                      <label
                        className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                        htmlFor="personnel"
                      >
                        Personel Seçimi
                      </label>
                      <div className="relative">
                        <select
                          id="personnel"
                          name="email"
                          autoComplete="username"
                          required
                          className="block w-full pl-3.5 pr-10 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 outline-none transition-colors appearance-none"
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
                        className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                        htmlFor="password"
                      >
                        Personel Şifresi
                      </label>
                      <div className="relative">
                        <Lock
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          enterKeyHint="done"
                          required
                          className="block w-full pl-10 pr-11 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 placeholder-slate-400 outline-none transition-colors"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          aria-pressed={showPassword}
                          aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700"
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
                      className="w-full flex items-center justify-center gap-2.5 bg-blue-700 hover:bg-blue-800 text-white px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Doğrulanıyor...</span>
                        </>
                      ) : (
                        <>
                          <span>Personel Girişi Yap</span>
                          <ArrowRight className="w-4 h-4 ml-auto" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Modül bazlı yetkilendirme
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    6 saatlik güvenli oturum koruması
                  </span>
                </div>
              </div>
            </div>

            {/* Secondary Super Admin Access Card */}
            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0 border border-slate-700">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Süper Admin Yönetim Paneli
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Personel hesapları, sayfa yetki tanımları ve sistem güvenlik yapılandırması
                  </p>
                </div>
              </div>

              <Link
                href="/sa-login"
                prefetch={true}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-4 py-2 rounded-lg font-bold text-xs uppercase whitespace-nowrap transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Yönetici Girişi</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
