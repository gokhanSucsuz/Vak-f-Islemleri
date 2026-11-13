import Link from "next/link";
import { ShieldAlert, Lock, ArrowRight, Landmark } from "lucide-react";

export default function UnauthorizedDirectAccessPage() {
  const panelUrl = process.env.PANEL_URL || "https://www.vakifyonetim.space";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.25) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-xl shadow-amber-500/20 mb-4 border border-amber-300/40">
            <Landmark className="w-8 h-8" />
          </div>
          <p className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase mb-1">
            T.C. Edirne Valiliği
          </p>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Sosyal Yardımlaşma ve Dayanışma Vakfı
          </h1>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-7 sm:p-9 space-y-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
              <Lock className="w-3.5 h-3.5" />
              Doğrudan Erişim Engellendi
            </span>
            <h2 className="text-xl font-bold text-slate-900 pt-1">
              Yetkisiz veya Doğrudan Giriş Yapılamaz
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Bu sisteme doğrudan bağlantı (URL) üzerinden erişim güvenlik politikası gereği kapatılmıştır.
              Sisteme yalnızca yetkili kurum Google hesabı ile{" "}
              <strong className="text-slate-900">Merkezi Erişim Paneli</strong> üzerinden
              güvenli SSO doğrulaması yapılarak giriş sağlanabilir.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 text-left space-y-1.5">
            <p className="font-bold text-slate-800">Nasıl Giriş Yapılır?</p>
            <p>1. Merkezi panele gidin ve yetkili kurum Google hesabınızla oturum açın.</p>
            <p>2. Panel üzerinden ilgili sistem kartındaki <strong>Güvenli Geçiş (SSO)</strong> butonuna tıklayın.</p>
          </div>

          <Link
            href={panelUrl}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-lg shadow-slate-900/20 transition-all"
          >
            <span>Merkezi Panele Git</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <p className="text-center text-[11px] text-slate-500 mt-6">
          © {new Date().getFullYear()} T.C. Edirne SYDV • Tüm erişim denemeleri kayıt altındadır.
        </p>
      </div>
    </div>
  );
}
