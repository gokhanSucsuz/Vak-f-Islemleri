"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Activity,
  Baby,
  Gift,
  FolderOpen,
  ScrollText,
  Presentation,
  ShieldCheck,
  BarChart3,
  Layers,
} from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  allowAuthorized?: boolean;
  group: "core" | "aid" | "admin";
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  const navItems: NavItem[] = [
    { name: "Ana Ekran", href: "/dashboard", icon: LayoutDashboard, roles: ["superadmin", "manager", "personnel"], group: "core" },
    { name: "Başvuru Dosyaları", href: "/dashboard/applications", icon: FolderOpen, roles: ["superadmin", "manager", "personnel"], group: "core" },
    { name: "Dilekçe İşlemleri", href: "/dashboard/petitions", icon: ScrollText, roles: ["superadmin", "manager", "personnel"], group: "core" },
    { name: "Sunular", href: "/dashboard/presentations", icon: Presentation, roles: ["superadmin", "manager", "personnel"], group: "core" },
    { name: "Bebek Maması", href: "/dashboard/baby-food", icon: Baby, roles: ["superadmin", "manager", "personnel"], group: "aid" },
    { name: "Ayni Yardım", href: "/dashboard/in-kind-aid", icon: Gift, roles: ["superadmin", "manager", "personnel"], group: "aid" },
    { name: "Yardım Türleri", href: "/dashboard/help-types", icon: Layers, roles: ["superadmin", "manager"], allowAuthorized: true, group: "aid" },
    { name: "Raporlar & İstatistik", href: "/dashboard/reports", icon: BarChart3, roles: ["superadmin", "manager", "personnel"], group: "admin" },
    { name: "Personel Yönetimi", href: "/dashboard/users", icon: Users, roles: ["superadmin"], group: "admin" },
    { name: "Sistem Logları", href: "/dashboard/logs", icon: Activity, roles: ["superadmin"], group: "admin" },
    { name: "Ayarlar", href: "/dashboard/settings", icon: Settings, roles: ["superadmin", "manager", "personnel"], group: "admin" },
  ];

  const userRole = session?.user?.role as string;
  const filteredItems = navItems.filter(
    (item) =>
      item.roles.includes(userRole) ||
      (item.allowAuthorized && Boolean(session?.user?.authorizedModules?.includes("helpTypes")))
  );

  const groups: Array<{ key: NavItem["group"]; label: string }> = [
    { key: "core", label: "Operasyonel İşlemler" },
    { key: "aid", label: "Sosyal Yardım Modülleri" },
    { key: "admin", label: "Raporlama & Yönetim" },
  ];

  const initials = (session?.user?.name || "Vİ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase("tr-TR"))
    .join("");

  return (
    <>
      <button
        type="button"
        aria-label={isOpen ? "Menüyü kapat" : "Menüyü aç"}
        aria-expanded={isOpen}
        className="md:hidden fixed top-3 left-3 z-50 p-2.5 bg-[#0b192c] text-white rounded-xl shadow-lg border border-slate-700/80 print:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
      </button>

      <aside
        aria-label="Yan menü"
        className={clsx(
          "fixed md:static inset-y-0 left-0 z-40 w-68 bg-gradient-to-b from-[#0b192c] via-[#0f223d] to-[#0a1628] text-white transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl border-r border-slate-800/80 md:translate-x-0 print:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Resmi Üst Şerit */}
        <div className="h-1 w-full bg-gradient-to-r from-[#c81e1e] via-blue-500 to-emerald-500 shrink-0" />

        {/* Kurumsal Marka Başlığı */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/50 ring-1 ring-white/15 shrink-0">
              <FileText className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300/90 leading-tight">
                T.C. Edirne SYDV
              </p>
              <p className="text-base font-extrabold tracking-tight text-white truncate">
                Vakıf İşlemleri
              </p>
            </div>
          </div>
        </div>

        {/* Kullanıcı & Güvenlik Kartı */}
        <div className="px-4 py-3.5 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-200 shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100 truncate">
                {session?.user?.name || "Kullanıcı"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-200 border border-blue-400/25">
                  {userRole === "superadmin"
                    ? "Süper Admin"
                    : userRole === "manager"
                    ? "Müdür"
                    : "Personel"}
                </span>
                {session?.user?.isAuthorized && userRole !== "superadmin" && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/25">
                    Yetkili
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Gruplanmış Navigasyon */}
        <nav aria-label="Ana menü" className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
          {groups.map((group) => {
            const items = filteredItems.filter((i) => i.group === group.key);
            if (items.length === 0) return null;
            return (
              <div key={group.key} className="space-y-1">
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400/80">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={clsx(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 group relative",
                            isActive
                              ? "bg-blue-600 text-white shadow-md shadow-blue-950/50 font-semibold"
                              : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                          )}
                        >
                          {isActive && (
                            <span
                              className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-white/90"
                              aria-hidden="true"
                            />
                          )}
                          <Icon
                            aria-hidden="true"
                            className={clsx(
                              "w-[18px] h-[18px] shrink-0 transition-colors",
                              isActive
                                ? "text-white"
                                : "text-slate-400 group-hover:text-blue-300"
                            )}
                          />
                          <span className="truncate">{item.name}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Alt Güvenlik & Çıkış Alanı */}
        <div className="p-3 border-t border-white/10 space-y-2 bg-black/15">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-400/20 text-[11px] text-emerald-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span className="truncate">AES-256-GCM • KVKK Korumalı</span>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/20 hover:text-red-200 border border-red-400/15 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Güvenli Çıkış Yap
          </button>
        </div>
      </aside>

      {isOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
