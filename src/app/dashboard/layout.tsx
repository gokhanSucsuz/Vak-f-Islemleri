import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden print:h-auto print:overflow-visible">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 w-full print:overflow-visible print:p-0">
        <div className="max-w-7xl mx-auto print:max-w-none">
          {children}
        </div>
      </main>
    </div>
  );
}
