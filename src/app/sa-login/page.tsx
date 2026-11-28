"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Lock,
  Mail,
  ShieldCheck,
  Shield,
  Eye,
  EyeOff,
  ChevronLeft,
  ArrowRight,
  Landmark,
  FolderOpen,
  Presentation,
  ScrollText,
  Users,
  Loader2,
} from "lucide-react";

export default function SuperAdminLoginPage() {
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (session?.user?.role) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password,
        loginType: "superadmin",
      });

      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Süper Admin girişi başarılı, yönlendiriliyorsunuz...");
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      toast.error("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

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

              <div className="pt-4 border-t border-slate-800/90 space-y-2.5">
                <div className="inline-flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[10px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wider">
                  <Landmark className="w-3.5 h-3.5 text-amber-400" />
                  <span>Vakıf İşlemleri • Süper Admin Portalı</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  Personel hesaplarının tanımlanması, modül bazlı erişim yetkilerinin yönetimi, sistem denetim kayıtları ve şablon yapılandırması için yüksek yetkili yönetim alanı.
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-2.5 text-xs text-slate-300">
                  <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Personel & Modül Yetkileri:</strong> Kullanıcı hesaplarını, şifrelerini ve sayfa bazlı erişim izinlerini tek ekrandan belirleme.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-300">
                  <Presentation className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Şablon & Kapak Yönetimi:</strong> Mütevelli Heyeti sunu şablonlarını, kapak slaytlarını ve geçiş efektlerini yapılandırma.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-300">
                  <ScrollText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Sistem Denetim Logları:</strong> Tüm kullanıcı oturumlarını ve veri işlemlerini zaman damgalı olarak denetleme.
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800/90 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                AES-256-GCM Şifreli Veri
              </span>
              <span>•</span>
              <span>Kayıtlı Denetim İzi</span>
            </div>
          </div>

          {/* RIGHT 7 COLUMNS: SUPER ADMIN VERIFICATION PORTAL */}
          <div className="lg:col-span-7 p-6 sm:p-8 bg-white flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 uppercase tracking-tight">
                    Süper Admin Girişi
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Yüksek yetkili sistem yönetimi için yönetici bilgilerinizi doğrulayın.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-amber-50 text-amber-800 px-3 py-1 rounded-full border border-amber-200 uppercase shrink-0">
                  <Shield className="w-3 h-3 text-amber-600" />
                  Yüksek Yetki
                </span>
              </div>

              <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 uppercase">
                        Sistem Yöneticisi Doğrulaması
                      </h3>
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded uppercase">
                        Süper Admin
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Tüm yönetici giriş denemeleri güvenlik denetim kayıtlarında saklanmaktadır.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                  <div>
                    <label
                      className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                      htmlFor="sa-email"
                    >
                      Süper Admin E-posta
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="sa-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        spellCheck={false}
                        enterKeyHint="next"
                        required
                        className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold bg-white text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 outline-none transition-colors"
                        placeholder="admin@vakif.local"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                      htmlFor="sa-password"
                    >
                      Yönetici Şifresi
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="sa-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        enterKeyHint="done"
                        required
                        className="block w-full pl-10 pr-11 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold bg-white text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 outline-none transition-colors"
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
                    className="w-full flex items-center justify-center gap-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Doğrulanıyor...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Süper Admin Olarak Giriş Yap</span>
                        <ArrowRight className="w-4 h-4 ml-auto" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Return to Personnel Login Card */}
            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-blue-400 flex items-center justify-center shrink-0 border border-slate-700">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Vakıf Personeli Giriş Ekranı
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Standart personel veya müdür oturumu açmak için geri dönün
                  </p>
                </div>
              </div>

              <Link
                href="/login"
                prefetch={true}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-4 py-2 rounded-lg font-bold text-xs uppercase whitespace-nowrap transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Personel Girişi</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
