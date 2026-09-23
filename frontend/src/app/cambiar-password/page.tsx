"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, changePassword, fetchMe } from "@/lib/api";

export default function CambiarPasswordPage() {
  const router = useRouter();
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchMe()
      .then(() => setReady(true))
      .catch(() => router.replace("/login"));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (nueva.trim().length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nueva !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await changePassword(nueva.trim(), confirmar.trim());
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 bg-[linear-gradient(155deg,#7bc24a_0%,#5fae38_36%,#3f7f27_72%,#28551a_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0px,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_11px)]" />

      <div className="relative z-10 w-full max-w-md rounded-[28px] bg-[#f3f8ec] p-8 shadow-2xl shadow-black/30 sm:p-10">
        <h1 className="text-center font-serif text-2xl font-bold text-[#274d17]">
          Cambia tu contraseña
        </h1>
        <p className="mt-2 text-center text-sm text-[#4f6b45]">
          Por seguridad debes definir una contraseña nueva antes de continuar.
        </p>

        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-[#c0392b]/25 bg-[#c0392b]/10 px-4 py-3 text-sm text-[#b3261e]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
          <div>
            <label htmlFor="nueva" className="mb-1.5 block text-sm font-semibold text-[#274d17]">
              Contraseña nueva
            </label>
            <input
              id="nueva"
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-[#d5e6c4] bg-[#f9fcf3] px-4 py-3 text-sm text-[#274d17] outline-none transition focus:border-[#5fae38] focus:ring-2 focus:ring-[#5fae38]/25 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="confirmar" className="mb-1.5 block text-sm font-semibold text-[#274d17]">
              Confirmar contraseña
            </label>
            <input
              id="confirmar"
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-[#d5e6c4] bg-[#f9fcf3] px-4 py-3 text-sm text-[#274d17] outline-none transition focus:border-[#5fae38] focus:ring-2 focus:ring-[#5fae38]/25 disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4f9c2c] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3f8523] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Guardando…" : "Guardar y continuar"}
          </button>
        </form>
      </div>
    </main>
  );
}
