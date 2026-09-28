"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, loginWithSsoTicket } from "@/lib/api";

export default function SsoCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const ticket = searchParams.get("ticket")?.trim() || "";
      if (!ticket) {
        setError("No se recibió un ticket SSO válido.");
        return;
      }

      try {
        const { user } = await loginWithSsoTicket(ticket);
        if (cancelled) return;
        router.replace(user.mustChangePassword ? "/cambiar-password" : "/");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : "No fue posible iniciar sesión con SSO.";
        setError(message);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7faf5] px-6">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe4e0] bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-[#14352a]">Acceso desde Suite Santacruz</h1>
        {!error ? (
          <div className="mt-4 flex items-center gap-3 text-sm text-[#5f7a68]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d6e6da] border-t-[#2f8f4e]" />
            Validando ticket de acceso...
          </div>
        ) : (
          <>
            <p className="mt-3 rounded-lg border border-[#f0c4c1] bg-[#fbeceb] px-3 py-2 text-sm text-[#b3261e]">
              {error}
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-4 rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#277a42]"
            >
              Ir a iniciar sesión
            </button>
          </>
        )}
      </div>
    </main>
  );
}
