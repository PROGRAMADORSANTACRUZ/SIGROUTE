"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, logout, type AuthUser } from "@/lib/api";
import { puedeAcceder, panelDeRuta } from "@/data/modulos";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  children?: NavItem[]; // sub-items para dropdown de 2do nivel (ej. Nivel de servicio)
  disabled?: boolean; // ej. Errands: placeholder aún sin construir
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const truckIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </svg>
);

const usersIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const nivelServicioIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const clientesIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
  </svg>
);

const dashboardIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const boxIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
    <path d="M9 7h6M9 11h6M9 15h4" />
  </svg>
);

const diagramaIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="12" y2="18" />
  </svg>
);

const checkIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const historyIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" />
  </svg>
);

const rutaIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h18M3 12c0-4.4 3.6-8 8-8M3 12c0 4.4 3.6 8 8 8M21 12c0-4.4-3.6-8-8-8M21 12c0 4.4-3.6 8-8 8M11 4c2 3 2 10 0 16M13 4c-2 3-2 10 0 16" />
  </svg>
);

const planNombreIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const clipboardIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" />
    <path d="M9 12h6M9 16h6M9 8h2" />
  </svg>
);

const gearIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const errandsIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4l2.5 2.5" />
  </svg>
);

const mapPinIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

const plantillaIcon = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" />
  </svg>
);

// Cada panel (Planeación/Ejecución) trae su propio Dashboard como primer
// ítem — ya no hay un Dashboard global suelto; el panel se elige en "/".
const navItems: NavItem[] = [];

// Dropdowns de 2do nivel del sidebar: Planeación (módulos originales de
// rutas_web), Módulos de ejecución (DISTRILOG + Errands + Plantillas TAT) y
// Configuración (maestros/catálogos de AMBOS dominios en un solo lugar,
// separados por sección en vez de repartidos entre Planeación y Ejecución).
const navGroups: NavGroup[] = [
  {
    label: "Planeación",
    items: [
      { href: "/dashboard?panel=planeacion", label: "Dashboard", icon: dashboardIcon },
      { href: "/planeacion/preplanificacion", label: "Preplanificación Siesa", icon: mapPinIcon },
      { href: "/planeacion/programacion", label: "Planificación", icon: diagramaIcon },
      { href: "/planeacion/asignacion", label: "Preasignación", icon: rutaIcon },
      { href: "/planeacion/areas", label: "Áreas para Cargar", icon: checkIcon },
      { href: "/planeacion/distribucion-produccion", label: "Distribución Producción", icon: boxIcon },
      { href: "/planeacion/simulador", label: "Simulador de Producción", icon: diagramaIcon },
      { href: "/planeacion/reportes", label: "Reportes", icon: historyIcon },
    ],
  },
  {
    label: "Módulos de ejecución",
    items: [
      { href: "/dashboard?panel=ejecucion", label: "Dashboard", icon: dashboardIcon },
      { href: "/ordenes", label: "Cargar Órdenes", icon: boxIcon },
      { href: "/asignacion-vehiculos", label: "Asignación de órdenes", icon: truckIcon },
      { href: "/planes", label: "Diagrama", icon: diagramaIcon },
      { href: "/clientes-rutas", label: "Clientes por Ruta", icon: rutaIcon },
      { href: "/planificacion-dl", label: "Planificación D.L.", icon: checkIcon },
      { href: "/historicos", label: "Históricos", icon: historyIcon },
      {
        href: "/nivel-de-servicio",
        label: "Nivel de servicio",
        icon: nivelServicioIcon,
        children: [
          { href: "/nivel-de-servicio", label: "Distribución", icon: nivelServicioIcon },
          { href: "/nivel-de-servicio/tat", label: "TAT", icon: nivelServicioIcon },
        ],
      },
      // Placeholder: el módulo real (antes embebido vía iframe SIGLOG) aún no
      // tiene lógica propia — se deja el ítem listo para conectarlo después.
      { href: "/errands", label: "Run Errands", icon: errandsIcon },
      { href: "/plantillas-tat/agropecuaria", label: "TAT Agropecuaria", icon: plantillaIcon },
      { href: "/plantillas-tat/inversiones", label: "TAT Inversiones", icon: plantillaIcon },
    ],
  },
  {
    label: "Configuración",
    items: [
      { href: "/configuracion/usuarios", label: "Usuarios", icon: usersIcon },
      { href: "/configuracion/roles", label: "Roles y permisos", icon: gearIcon },
      { href: "/configuracion/auditoria", label: "Auditoría", icon: clipboardIcon },
      { href: "/configuracion/clientes", label: "Clientes", icon: clientesIcon },
      { href: "/configuracion/vehiculos", label: "Vehículos", icon: truckIcon },
      { href: "/configuracion/conductores", label: "Conductores", icon: usersIcon },
      { href: "/configuracion/auxiliares", label: "Auxiliares", icon: usersIcon },
      { href: "/configuracion/rutas", label: "Rutas", icon: rutaIcon },
      { href: "/configuracion/plan-nombres", label: "Nombres de planes", icon: planNombreIcon },
    ],
  },
];

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  OPERADOR: "Operador",
  CONSULTA: "Consulta",
};

export default function Sidebar({
  mobileOpen = false,
  onClose = () => {},
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  // Ruta completa (con query) para poder distinguir /dashboard?panel=planeacion
  // de /dashboard?panel=ejecucion en el estado "activo" del ítem del Sidebar.
  const rutaActual = search.toString() ? `${pathname}?${search.toString()}` : pathname;
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  // Cuál de los 2 paneles (Planeación/Ejecución) se muestra en el Sidebar.
  // Se detecta automáticamente por la ruta actual y se recuerda en
  // localStorage para paginas "neutras" (Configuración, / , /dashboard sin
  // ?panel=) que no cambian el panel activo por sí solas.
  const [panelActivo, setPanelActivo] = useState<"Planeación" | "Ejecución" | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map((g) => [g.label, g.label !== "Configuración"]))
  );
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});
  // Sidebar colapsable a modo "riel" de solo íconos; se recuerda entre visitas.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setUser(getUser()); }, []);
  useEffect(() => { setCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1"); }, []);
  useEffect(() => {
    const guardado = window.localStorage.getItem("sigroute-panel-activo");
    if (guardado === "Planeación" || guardado === "Ejecución") setPanelActivo(guardado);
  }, []);
  useEffect(() => {
    const detectado = panelDeRuta(rutaActual);
    if (detectado) {
      setPanelActivo(detectado);
      window.localStorage.setItem("sigroute-panel-activo", detectado);
    }
  }, [rutaActual]);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  // Cierra el drawer al navegar (en móvil).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onClose(); }, [pathname]);

  function toggleGroup(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }
  function toggleDropdown(href: string) {
    setOpenDropdowns((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const initials = (user?.nombreCompleto ?? user?.username ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function renderItem(item: NavItem) {
    const active =
      rutaActual === item.href ||
      (!item.href.includes("?") && pathname.startsWith(`${item.href}/`) && !item.children);
    const anyChildActive = item.children?.some(
      (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
    );
    const isDropOpen = openDropdowns[item.href] ?? anyChildActive ?? false;

    if (item.disabled) {
      return (
        <div
          key={item.href}
          title="Próximamente"
          className={`flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/30 ${collapsed ? "justify-center" : ""}`}
        >
          <span className="text-white/25">{item.icon}</span>
          {!collapsed && (
            <>
              {item.label}
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/50">
                Pronto
              </span>
            </>
          )}
        </div>
      );
    }

    // En modo colapsado se simplifica a un link directo (sin desplegable),
    // apoyado en que el ítem con hijos también es una página válida por sí sola.
    if (item.children && collapsed) {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          className={`flex items-center justify-center rounded-lg px-3 py-2.5 text-sm transition-colors ${
            anyChildActive ? "bg-white/15 font-semibold text-white" : "font-medium text-white/75 hover:bg-white/10"
          }`}
        >
          <span className={anyChildActive ? "text-white" : "text-white/60"}>{item.icon}</span>
        </Link>
      );
    }

    if (item.children) {
      return (
        <div key={item.href}>
          <button
            onClick={() => toggleDropdown(item.href)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              anyChildActive ? "bg-white/15 font-semibold text-white" : "font-medium text-white/75 hover:bg-white/10"
            }`}
          >
            <span className={anyChildActive ? "text-white" : "text-white/60"}>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            <svg className={`h-4 w-4 transition-transform ${isDropOpen ? "" : "-rotate-90"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {isDropOpen && (
            <div className="ml-8 mt-0.5 space-y-0.5">
              {item.children.map((child) => {
                const ca = pathname === child.href;
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      ca ? "bg-white/15 font-semibold text-white" : "font-medium text-white/75 hover:bg-white/10"
                    }`}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${collapsed ? "justify-center" : ""} ${
          active ? "bg-white/15 font-semibold text-white" : "font-medium text-white/75 hover:bg-white/10"
        }`}
      >
        <span className={active ? "text-white" : "text-white/60"}>{item.icon}</span>
        {!collapsed && item.label}
      </Link>
    );
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen ${collapsed ? "lg:w-[76px]" : "lg:w-64"} w-64 shrink-0 transform flex-col overflow-visible bg-[linear-gradient(155deg,#14352a_0%,#2f8f4e_50%,#102c21_100%)] text-white transition-[width,transform] duration-200 lg:relative lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca — enlaza a "/" para volver al selector de panel */}
        <div className={`flex items-center gap-3 border-b border-white/15 px-5 py-4 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
          <Link href="/" title="Cambiar de panel" className={`flex min-w-0 items-center gap-3 ${collapsed ? "lg:justify-center" : ""}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 p-1.5 backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Santacruz" className="h-full w-full object-contain" />
            </div>
            <div className={`leading-tight ${collapsed ? "lg:hidden" : ""}`}>
              <p className="text-sm font-bold text-white">SigRoute</p>
              <p className="text-xs text-white/60">Grupo Santacruz</p>
            </div>
          </Link>
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
          <div className="space-y-0.5">
            {navItems.map((item) => renderItem(item))}
          </div>

          {navGroups
            .filter((group) => {
              // Configuración siempre se evalúa; el otro panel se oculta
              // mientras no sea el panel activo (se detecta por la ruta).
              if (group.label === "Configuración") return true;
              if (!panelActivo) return true; // aún sin detectar: no ocultar de más
              return group.label === (panelActivo === "Planeación" ? "Planeación" : "Módulos de ejecución");
            })
            .map((group) => {
            const isOpen = open[group.label];
            const esConfiguracion = group.label === "Configuración";
            const visibleItems = group.items.filter(
              (item) => item.disabled || puedeAcceder(item.href, user?.role, user?.permisos)
            );
            if (visibleItems.length === 0) return null;
            // Planeación/Ejecución ya vienen filtradas a un solo panel a la
            // vez, así que sus ítems se muestran siempre (sin plegar); solo
            // Configuración conserva el dropdown plegable (cerrado por defecto).
            if (!esConfiguracion) {
              return (
                <div key={group.label}>
                  <p className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/45 ${collapsed ? "lg:hidden" : ""}`}>
                    {group.label}
                  </p>
                  {collapsed && <div className="my-1.5 hidden border-t border-white/10 lg:block" />}
                  <div className="mt-1 space-y-0.5">
                    {visibleItems.map((item) => (
                      <div key={item.href}>
                        {renderItem(item)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/45 transition-colors hover:text-white/75 ${collapsed ? "lg:hidden" : ""}`}
                >
                  {group.label}
                  <svg
                    className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {collapsed && <div className="my-1.5 hidden border-t border-white/10 lg:block" />}
                {(isOpen || collapsed) && (
                  <div className="mt-1 space-y-0.5">
                    {visibleItems.map((item) => (
                      <div key={item.href}>
                        {renderItem(item)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Usuario */}
        <div className="border-t border-white/15 p-3">
          <div className={`flex items-center gap-3 rounded-lg px-2 py-2 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
              {initials}
            </div>
            <div className={`min-w-0 flex-1 leading-tight ${collapsed ? "lg:hidden" : ""}`}>
              <p className="truncate text-sm font-medium text-white">
                {user?.nombreCompleto ?? user?.username ?? "Usuario"}
              </p>
              <p className="truncate text-xs text-white/60">
                {user?.role ? roleLabels[user.role] ?? user.role : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/")}
            title={collapsed ? "Cambiar panel" : undefined}
            className={`mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 ${collapsed ? "lg:justify-center" : ""}`}
          >
            <svg className="h-5 w-5 shrink-0 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className={collapsed ? "lg:hidden" : ""}>Cambiar panel</span>
          </button>
          <div className={`mt-1 flex items-center gap-1.5 ${collapsed ? "lg:flex-col" : ""}`}>
            <button
              onClick={handleLogout}
              title={collapsed ? "Cerrar sesión" : undefined}
              className={`flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 ${collapsed ? "lg:w-full lg:flex-none lg:justify-center" : ""}`}
            >
              <svg className="h-5 w-5 shrink-0 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className={collapsed ? "lg:hidden" : ""}>Cerrar sesión</span>
            </button>
            <button
              onClick={toggleCollapsed}
              title={collapsed ? "Expandir menú" : "Contraer menú"}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:flex"
            >
              <svg className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
