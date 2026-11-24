import Sidebar from "@/components/Sidebar";
import { ShieldCheck, CalendarDays } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const todayLabel = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <div className="flex h-dvh bg-[#f3f6fb] overflow-hidden print:h-auto print:overflow-visible">
      <a
        href="#main-content"
        className="visually-hidden fixed top-3 left-3 z-[100] px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-bold shadow-lg"
      >
        Ana içeriğe geç
      </a>

      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        {/* Resmi Kurum Üst Bilgi Şeridi */}
        <header className="shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/85 px-4 pl-16 md:pl-6 md:px-8 h-14 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="hidden sm:inline-block w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15 shrink-0"
              aria-hidden="true"
            />
            <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">
              Vakıf İşlemleri
              <span className="hidden lg:inline font-medium text-slate-400">
                {" "}• Dijital İşlem ve Evrak Yönetim Portalı
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100/90 border border-slate-200/80 text-xs font-medium text-slate-600">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>{todayLabel}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span className="hidden xs:inline">KVKK Şifreli</span>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-6 md:p-7 w-full print:overflow-visible print:p-0 focus:outline-none"
        >
          <div className="max-w-7xl mx-auto print:max-w-none">{children}</div>
        </main>
      </div>
    </div>
  );
}
