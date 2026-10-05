"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LayoutDashboard, Users, FileText, Settings, LogOut, Menu, X, Activity, Baby } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { name: "Ana Ekran", href: "/dashboard", icon: LayoutDashboard, roles: ["superadmin", "manager", "personnel"] },
    { name: "Personel Yönetimi", href: "/dashboard/users", icon: Users, roles: ["superadmin"] },
    { name: "Sistem Logları", href: "/dashboard/logs", icon: Activity, roles: ["superadmin"] },
    { name: "Raporlar", href: "/dashboard/reports", icon: FileText, roles: ["superadmin", "manager"] },
    { name: "Yardım Türleri", href: "/dashboard/help-types", icon: FileText, roles: ["superadmin", "manager"] },
    { name: "Bebek Maması", href: "/dashboard/baby-food", icon: Baby, roles: ["superadmin", "manager", "personnel"] },
    { name: "Şifre Değiştir", href: "/dashboard/settings", icon: Settings, roles: ["superadmin", "manager", "personnel"] },
  ];

  const filteredItems = navItems.filter(item => item.roles.includes(session?.user?.role as string));

  return (
    <>
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md print:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      <div className={clsx(
        "fixed md:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl md:translate-x-0 print:hidden",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-blue-600 p-2 rounded-lg">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Vakıf İşlemleri</h1>
        </div>

        <div className="p-4 border-b border-slate-800">
          <p className="text-sm text-slate-400">Hoş geldin,</p>
          <p className="font-semibold text-slate-100 truncate">{session?.user?.name}</p>
          <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-800">
            {session?.user?.role === 'superadmin' ? 'Süper Admin' : session?.user?.role === 'manager' ? 'Müdür' : 'Personel'}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {filteredItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                  isActive 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className={clsx("w-5 h-5", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Çıkış Yap
          </button>
        </div>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
