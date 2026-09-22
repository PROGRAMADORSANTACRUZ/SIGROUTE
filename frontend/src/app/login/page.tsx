"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getVersiculo, login, type Versiculo } from "@/lib/api";
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versiculo, setVersiculo] = useState<Versiculo | null>(null);

  useEffect(() => {
    getVersiculo().then(setVersiculo).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Ingresa tu usuario y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const { user } = await login(username.trim(), password);
      router.push(user.mustChangePassword ? "/cambiar-password" : "/");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Error inesperado. Intenta de nuevo.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Panel izquierdo: marca */}
      <section className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex bg-[linear-gradient(155deg,#14352a_0%,#2f8f4e_50%,#102c21_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0px,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_11px)]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/10 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/15 p-2 backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Santacruz" className="h-full w-full object-contain" />
            </span>
            <div className="leading-tight">
              <p className="text-xl font-bold tracking-tight">SigRoute</p>
              <p className="text-xs font-medium uppercase tracking-wide text-white/70">Grupo Santacruz</p>
            </div>
          </div>

          <div className="mt-14 max-w-md">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">Rutas y logística, todo en un solo lugar.</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              Planea rutas y cargue, ejecuta despachos y haz seguimiento al nivel de servicio del Grupo Santacruz.
            </p>
          </div>

          <div className="mt-10 flex flex-col gap-3">
            {["Planeación y asignación de rutas", "Ejecución y despacho en tiempo real", "Nivel de servicio y reportes"].map((t) => (
              <div key={t} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/15">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>

        {versiculo && (
          <blockquote className="relative z-10 border-t border-white/20 pt-5">
            <p className="text-sm italic leading-relaxed text-white/95">«{versiculo.texto}»</p>
            <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-white/70">{versiculo.cita}</span>
          </blockquote>
        )}
      </section>

      {/* Panel derecho: formulario */}
      <section className="flex items-center justify-center bg-[#f7faf5] p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center lg:hidden">
            <LogoMark />
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-[#2f8f4e]">Grupo Santacruz</p>
          <h2 className="mt-1 text-2xl font-bold text-[#14352a]">Iniciar sesión</h2>
          <p className="mt-2 text-sm text-[#5f7a68]">Ingresa tus credenciales para acceder al sistema.</p>

          {error && (
            <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-[#f0c4c1] bg-[#fbeceb] px-4 py-3 text-sm text-[#b3261e]">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-[#14352a]">
                Usuario
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#7a9c85]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                </span>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Tu usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#dfe4e0] bg-white py-3 pl-11 pr-4 text-sm text-[#14352a] outline-none transition placeholder:text-[#9aa4af] focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-[#14352a]">
                Contraseña
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#7a9c85]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#dfe4e0] bg-white py-3 pl-11 pr-11 text-sm text-[#14352a] outline-none transition placeholder:text-[#9aa4af] focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#7a9c85] transition-colors hover:text-[#2f8f4e]"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f8f4e] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#277a42] focus:ring-2 focus:ring-[#2f8f4e]/40 focus:ring-offset-2 focus:ring-offset-[#f7faf5] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
                </svg>
              )}
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[#7a8794]">
            ¿Problemas para acceder? Contacta al administrador del sistema.
          </p>

          {versiculo && (
            <blockquote className="mt-8 border-t border-[#e1e9dd] pt-5 lg:hidden">
              <p className="text-sm italic leading-relaxed text-[#45505e]">«{versiculo.texto}»</p>
              <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-[#7a8794]">{versiculo.cita}</span>
            </blockquote>
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * Muestra el logo real desde `/logo.png`. Si el archivo aún no existe,
 * cae al emblema SVG de respaldo.
 * Para usar el logo oficial: guarda la imagen en `frontend/public/logo.png`.
 */
function LogoMark() {
  const [failed, setFailed] = useState(false);

  if (failed) return <FallbackEmblem />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Frigorífico Agropecuaria Santacruz"
      className="h-20 w-auto"
      onError={() => setFailed(true)}
    />
  );
}

function FallbackEmblem() {
  return (
    <svg width="72" height="82" viewBox="0 0 72 82" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7bc24a" />
          <stop offset="1" stopColor="#3f7f27" />
        </linearGradient>
      </defs>
      <path
        d="M36 2 66 12 66 40 C66 58 52 71 36 79 C20 71 6 58 6 40 L6 12 Z"
        fill="url(#leaf)"
      />
      <path
        d="M36 8 60 16.5 60 40 C60 54 49 65 36 72 C23 65 12 54 12 40 L12 16.5 Z"
        fill="#28551a"
      />
      {/* Toro estilizado */}
      <g fill="#f3f8ec">
        <path d="M22 21 c-2 -3 -6 -4 -6 -1 c0 3 3 5 5 6 c-2 3 -1 8 3 10 c3 2 9 2 12 0 c4 -2 5 -7 3 -10 c2 -1 5 -3 5 -6 c0 -3 -4 -2 -6 1 c-3 -2 -8 -2 -11 0 c-1 -1 -2 -1 -3 0 Z" />
        <circle cx="30" cy="30" r="1.4" fill="#28551a" />
        <circle cx="36" cy="30" r="1.4" fill="#28551a" />
      </g>
      {/* Banner */}
      <rect x="9" y="45" width="54" height="13" rx="2.5" fill="#4f9c2c" />
      <text
        x="36"
        y="54.5"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="8"
        fontWeight="700"
        fill="#f3f8ec"
      >
        Santacruz
      </text>
    </svg>
  );
}
