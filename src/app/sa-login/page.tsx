"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Lock, Mail, ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
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
    <main className="min-h-screen flex flex-col bg-[#071120] relative overflow-hidden">
      <div className="h-1.5 w-full bg-gradient-to-r from-[#c81e1e] via-red-500 to-amber-500" />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-5">
          <div className="border border-slate-800 bg-[#0d1b30]/95 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/70 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shadow-lg shadow-red-900/40 shrink-0">
                <ShieldCheck className="text-white w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-400">
                  Yüksek Yetkili Erişim
                </p>
                <h1 className="text-xl font-extrabold text-white tracking-tight">
                  Süper Admin Portalı
                </h1>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
                  htmlFor="sa-email"
                >
                  Süper Admin E-posta
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                  <input
                    id="sa-email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full pl-10 pr-3.5 py-3 border border-slate-700 rounded-xl text-sm bg-slate-900/80 text-white placeholder-slate-500 focus:border-red-500 transition-colors"
                    placeholder="admin@sydv.gov.tr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
                  htmlFor="sa-password"
                >
                  Şifre
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                  <input
                    id="sa-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="block w-full pl-10 pr-11 py-3 border border-slate-700 rounded-xl text-sm bg-slate-900/80 text-white placeholder-slate-500 focus:border-red-500 transition-colors"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
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
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl shadow-lg shadow-red-950/40 text-sm font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Doğrulanıyor...
                  </>
                ) : (
                  "Yetkili Girişi Yap"
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] text-slate-500">
            Tüm yönetici girişleri sistem denetim kayıtlarında saklanmaktadır.
          </p>
        </div>
      </div>
    </main>
  );
}
