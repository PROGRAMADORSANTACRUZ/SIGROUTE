"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetchMe()
      .then((user) => {
        if (user.mustChangePassword) {
          router.replace("/cambiar-password");
          return;
        }
        setReady(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!ready) return null;

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="flex h-screen bg-[#f3f6f1] print:block print:h-auto">
      <div className="print:hidden">
        <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col print:block">
        {/* Barra superior móvil */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[#eceef0] bg-white px-4 py-2.5 lg:hidden print:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="rounded-lg p-2 text-[#45505e] hover:bg-[#f4f6f3]"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Santacruz" className="h-7 w-7 object-contain" />
            <span className="text-sm font-bold text-[#1f2937]">SigRoute</span>
          </div>
        </header>
        <main className="nice-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-white print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
