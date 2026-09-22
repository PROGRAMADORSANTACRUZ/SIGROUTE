"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Si se pasa, el diálogo pide un valor de texto y confirm() resuelve con ese string (o null si se cancela). */
  input?: { label: string; type?: "text" | "password" | "number"; placeholder?: string; defaultValue?: string };
}

type Resolver = (value: string | boolean | null) => void;

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: ConfirmOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Reemplaza confirm()/prompt() nativos con un modal propio (jerarquía clara,
// variante "danger" para acciones destructivas, soporta un campo de texto).
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [value, setValue] = useState("");
  const resolverRef = useRef<Resolver | null>(null);

  const open = useCallback((o: ConfirmOptions): Promise<string | boolean | null> => {
    setOpts(o);
    setValue(o.input?.defaultValue ?? "");
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirm = useCallback(async (o: ConfirmOptions) => !!(await open(o)), [open]);
  const prompt = useCallback(async (o: ConfirmOptions) => (await open(o)) as string | null, [open]);

  function close(result: string | boolean | null) {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOpts(null);
  }

  const ctxValue = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <ConfirmContext.Provider value={ctxValue}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={() => close(opts.input ? null : false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-5">
              <h3 className="text-base font-semibold text-[#14352a]">{opts.title}</h3>
              {opts.message && <p className="mt-1.5 text-sm text-[#5f7a68]">{opts.message}</p>}
            </div>
            {opts.input && (
              <div className="px-6 pt-3">
                <label className="mb-1 block text-xs font-medium text-[#7a8794]">{opts.input.label}</label>
                <input
                  autoFocus
                  type={opts.input.type ?? "text"}
                  value={value}
                  placeholder={opts.input.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) close(value.trim()); }}
                  className="w-full rounded-lg border border-[#dfe4e0] px-3 py-2 text-sm outline-none focus:border-[#2f8f4e]"
                />
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-[#eceef0] px-6 py-4">
              <button onClick={() => close(opts.input ? null : false)} className="rounded-lg border border-[#dfe4e0] px-4 py-2 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">
                {opts.cancelLabel ?? "Cancelar"}
              </button>
              <button
                onClick={() => close(opts.input ? value.trim() : true)}
                disabled={!!opts.input && !value.trim()}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${opts.danger ? "bg-[#b3261e] hover:bg-[#961f18]" : "bg-[#2f8f4e] hover:bg-[#277a42]"}`}
              >
                {opts.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}
