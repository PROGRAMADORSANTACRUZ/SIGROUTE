"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchMe, logout, type AuthUser } from "@/lib/api";
import { puedeAccederPanel, primeraRutaPanel, type Modulo } from "@/data/modulos";

const iconPlaneacion = (
  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="12" y2="18" />
  </svg>
);

const iconEjecucion = (
  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" />
  </svg>
);

const iconConfiguracion = (
  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const PANELES: { grupo: Modulo["grupo"]; titulo: string; descripcion: string; icon: React.ReactNode }[] = [
  { grupo: "Planeación", titulo: "Planeación", descripcion: "Planificación, preasignación, distribución y reportes.", icon: iconPlaneacion },
  { grupo: "Ejecución", titulo: "Ejecución", descripcion: "Cargue de órdenes, despacho, nivel de servicio y Run Errands.", icon: iconEjecucion },
  { grupo: "Configuración", titulo: "Configuración", descripcion: "Usuarios, roles, catálogos y maestros del sistema.", icon: iconConfiguracion },
];

export default function PanelSelector() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then((u) => {
        if (u.mustChangePassword) { router.replace("/cambiar-password"); return; }
        setUser(u);
        setLoading(false);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !user) return null;

  const primerNombre = (user.nombreCompleto || user.username).split(" ")[0];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(155deg,#14352a_0%,#2f8f4e_50%,#102c21_100%)] p-6">
      <div className="pointer-events-none fixed inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0px,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_11px)]" />
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-white/15 p-2 backdrop-blur-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Santacruz" className="h-full w-full object-contain" />
        </span>
        <h1 className="mt-5 text-3xl font-bold text-white">Hola, {primerNombre}</h1>
        <p className="mt-1 text-sm text-white/80">¿A qué panel deseas ingresar?</p>

        <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {PANELES.map((p) => {
            const habilitado = puedeAccederPanel(p.grupo, user.role, user.permisos);
            const destino = primeraRutaPanel(p.grupo, user.role, user.permisos);
            const contenido = (
              <>
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${habilitado ? "bg-[#e8f3e2] text-[#2f8f4e]" : "bg-[#f0f2ee] text-[#b7bfb9]"}`}>
                  {p.icon}
                </span>
                <h2 className={`mt-4 text-lg font-bold ${habilitado ? "text-[#14352a]" : "text-[#9aa4af]"}`}>{p.titulo}</h2>
                <p className={`mt-1 text-xs leading-relaxed ${habilitado ? "text-[#7a8794]" : "text-[#b7bfb9]"}`}>{p.descripcion}</p>
                <span className={`mt-4 text-sm font-semibold ${habilitado ? "text-[#2f8f4e]" : "text-[#b7bfb9]"}`}>
                  {habilitado ? "Ingresar →" : "Sin acceso"}
                </span>
              </>
            );
            if (!habilitado || !destino) {
              return (
                <div key={p.grupo} className="flex cursor-not-allowed flex-col items-start rounded-2xl bg-[#f7faf5]/60 p-6 text-left opacity-60 grayscale">
                  {contenido}
                </div>
              );
            }
            return (
              <Link key={p.grupo} href={destino} className="flex flex-col items-start rounded-2xl bg-[#f7faf5] p-6 text-left shadow-lg transition-transform hover:-translate-y-0.5">
                {contenido}
              </Link>
            );
          })}
        </div>

        <button onClick={handleLogout} className="mt-10 text-sm font-medium text-white/70 hover:text-white hover:underline">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
