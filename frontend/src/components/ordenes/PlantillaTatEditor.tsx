"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import PageHeader from "@/components/PageHeader";
import { IconDownload, IconTrash, IconUpload } from "@/components/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { usePermiso } from "@/lib/permisos";
import SoloLecturaBadge from "@/components/SoloLecturaBadge";
import EmptyState from "@/components/EmptyState";
import {
  getAuxiliares, getClientes, getConductores, getRutas, getVehiculosExternos,
  type Auxiliar, type Cliente, type Conductor, type Ruta, type VehiculoExterno,
} from "@/lib/api";
import { getBorradorPlantillaTat, guardarBorradorPlantillaTat, subirPlantillaTat, type FilaPlantillaTat } from "@/lib/api";

type Origen = "AGROPECUARIA" | "INVERSIONES";
type EstadoFila = "idle" | "buscando" | "ok" | "error";
type TipoCol = "fecha" | "factura" | "placa" | "conductor" | "auxiliar" | "ruta" | "cliente" | "texto";

interface FilaEdit {
  fecha: string;
  numFac: string;
  placa: string;
  conductor: string;
  auxiliar: string;
  ruta: string;
  cliente: string;
  extra: Record<string, string>;
  estadoFila: EstadoFila;
  mensaje?: string;
}

interface ColDef { header: string; tipo: TipoCol; campo?: string }

// Columnas EXACTAS de cada plantilla real (mismo orden y encabezado que el
// Excel que ya usa la gente: "LISTADO DE DESPACHO" para Agropecuaria y
// "Datos" para Inversiones), para que copiar/pegar bloques desde Excel quede
// alineado columna por columna. Deben coincidir con `PLANTILLA_COLUMNAS` del
// backend (routes/ordenes.ts).
const COLUMNAS: Record<Origen, ColDef[]> = {
  AGROPECUARIA: [
    { header: "NO. FACTURA", tipo: "factura" },
    { header: "NIT", tipo: "texto", campo: "nit" },
    { header: "CLIENTES", tipo: "cliente" },
    { header: "DINERO", tipo: "texto", campo: "dinero" },
    { header: "KILO FAC.", tipo: "texto", campo: "kilo" },
    { header: "CONDUCTOR", tipo: "conductor" },
    { header: "AUXLIAR", tipo: "auxiliar" },
    { header: "PLACA", tipo: "placa" },
    { header: "FECHA", tipo: "fecha" },
    { header: "RUTA", tipo: "ruta" },
    { header: "AZ", tipo: "texto", campo: "az" },
    { header: "NG", tipo: "texto", campo: "ng" },
    { header: "RJ", tipo: "texto", campo: "rj" },
    { header: "GR", tipo: "texto", campo: "gr" },
    { header: "VD", tipo: "texto", campo: "vd" },
    { header: "CAJAS", tipo: "texto", campo: "caja" },
    { header: "peso salida", tipo: "texto", campo: "peso_salida" },
  ],
  INVERSIONES: [
    { header: "Fecha Despacho", tipo: "fecha" },
    { header: "Factura", tipo: "factura" },
    { header: "Cliente", tipo: "cliente" },
    { header: "Barrio", tipo: "texto", campo: "barrio" },
    { header: "$ Valor", tipo: "texto", campo: "valor" },
    { header: "Placas", tipo: "placa" },
    { header: "Conductor", tipo: "conductor" },
    { header: "Auxiliar", tipo: "auxiliar" },
    { header: "Planilla", tipo: "ruta" },
    { header: "Estado", tipo: "texto", campo: "estado" },
    { header: "Novedades", tipo: "texto", campo: "novedades" },
    { header: "Responsabilidad", tipo: "texto", campo: "responsabilidad" },
    { header: "Detalle", tipo: "texto", campo: "detalle" },
    { header: "Mes", tipo: "texto", campo: "mes" },
  ],
};

// Campo de `extra` donde vive el nombre del cliente (AGROPECUARIA lo trae en
// la columna "CLIENTES", INVERSIONES en "Cliente").
const CAMPO_CLIENTE_EXTRA: Record<Origen, string> = { AGROPECUARIA: "clientes", INVERSIONES: "cliente" };

const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function mesDeFecha(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? MESES_ES[Number(m[2]) - 1] ?? "" : "";
}

function filaNueva(): FilaEdit {
  return { fecha: "", numFac: "", placa: "", conductor: "", auxiliar: "", ruta: "", cliente: "", extra: {}, estadoFila: "idle" };
}
const FILAS_POR_DEFECTO = 10;
function filasVacias(): FilaEdit[] {
  return Array.from({ length: FILAS_POR_DEFECTO }, filaNueva);
}

function getValor(f: FilaEdit, col: ColDef): string {
  switch (col.tipo) {
    case "fecha": return f.fecha;
    case "factura": return f.numFac;
    case "placa": return f.placa;
    case "conductor": return f.conductor;
    case "auxiliar": return f.auxiliar;
    case "ruta": return f.ruta;
    case "cliente": return f.cliente;
    default: return f.extra[col.campo!] ?? "";
  }
}

// Para comparar/cruzar contra el maestro (placa, conductor, auxiliar, ruta,
// cliente) sin que espacios, mayúsculas, tildes o guiones de más rompan el
// cruce (ej. "WEM-422" vs "wem 422", "Miguel  Candela" vs "MIGUEL CANDELA").
function normalizarComparacion(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Si el valor normalizado coincide con exactamente una opción del maestro,
// se devuelve la forma EXACTA guardada en la BD (para que quede canonizado);
// si no hay ninguna coincidencia se deja el valor tal como se escribió.
function buscarCanonico(valor: string, opciones: string[]): string | null {
  const objetivo = normalizarComparacion(valor);
  if (!objetivo) return null;
  return opciones.find((o) => normalizarComparacion(o) === objetivo) ?? null;
}

const TIPOS_CANONIZABLES: TipoCol[] = ["placa", "conductor", "auxiliar", "ruta", "cliente"];

function conValor(f: FilaEdit, col: ColDef, valorCrudo: string, origen: Origen, opciones?: Partial<Record<TipoCol, string[]>>): FilaEdit {
  // Las fechas pegadas desde Excel (o tipeadas) pueden venir dd/mm/aaaa; el
  // input type="date" exige yyyy-mm-dd, así que siempre se normalizan aquí.
  let valor = col.tipo === "fecha" ? fechaExcelATexto(valorCrudo) : valorCrudo;
  if (opciones && TIPOS_CANONIZABLES.includes(col.tipo)) {
    valor = buscarCanonico(valor, opciones[col.tipo] ?? []) ?? valor;
  }
  switch (col.tipo) {
    case "fecha": return { ...f, fecha: valor };
    case "factura": return { ...f, numFac: valor };
    case "placa": return { ...f, placa: valor };
    case "conductor": return { ...f, conductor: valor };
    case "auxiliar": return { ...f, auxiliar: valor };
    case "ruta": return { ...f, ruta: valor };
    case "cliente": return { ...f, cliente: valor, extra: { ...f.extra, [CAMPO_CLIENTE_EXTRA[origen]]: valor } };
    default: return { ...f, extra: { ...f.extra, [col.campo!]: valor } };
  }
}

function fechaExcelATexto(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s;
}

const ESTADO_PILL: Record<EstadoFila, string> = {
  idle: "",
  buscando: "bg-[#e6effb] text-[#1a5fb4]",
  ok: "bg-[#e8f3e2] text-[#2f8f4e]",
  error: "bg-[#fbeceb] text-[#b3261e]",
};
const ESTADO_LABEL: Record<EstadoFila, string> = {
  idle: "", buscando: "Buscando en Siesa…", ok: "Datos encontrados", error: "Error",
};

export default function PlantillaTatEditor({ origen, titulo, subtitulo }: { origen: Origen; titulo: string; subtitulo: string }) {
  const puedeVer = usePermiso("plantillas_tat.ver");
  const puedeEditar = usePermiso("plantillas_tat.editar");
  const [filas, setFilas] = useState<FilaEdit[]>(() => filasVacias());
  const [guardando, setGuardando] = useState(false);
  const [cargandoBorrador, setCargandoBorrador] = useState(true);
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoExterno[]>([]);
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [auxiliares, setAuxiliares] = useState<Auxiliar[]>([]);
  const [clientesTat, setClientesTat] = useState<Cliente[]>([]);
  const [sel, setSel] = useState<{ r0: number; c0: number; r1: number; c1: number } | null>(null);
  const draggingRef = useRef(false);
  const jornadaRef = useRef<string | null>(null);
  const listoParaGuardar = useRef(false);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { showToast } = useToast();
  const columnas = COLUMNAS[origen];

  useEffect(() => {
    getConductores().then(setConductores).catch(() => setConductores([]));
    // El maestro de placas real vive en Drivin (35 vehículos activos hoy);
    // la tabla local `Vehiculo` quedó desactualizada (solo 4 filas viejas).
    getVehiculosExternos().then(setVehiculos).catch(() => setVehiculos([]));
    getRutas().then(setRutas).catch(() => setRutas([]));
    getAuxiliares().then(setAuxiliares).catch(() => setAuxiliares([]));
    getClientes().then((cs) => setClientesTat(cs.filter((c) => c.tipo === "TAT"))).catch(() => setClientesTat([]));
  }, []);

  // El borrador de la grilla vive en BD (no localStorage): cualquier usuario
  // que abra esta página ve/edita el mismo avance del día.
  useEffect(() => {
    listoParaGuardar.current = false;
    setCargandoBorrador(true);
    getBorradorPlantillaTat<FilaEdit>(origen)
      .then((r) => {
        jornadaRef.current = r.jornada;
        setFilas(r.filas.length > 0 ? r.filas.map((f) => ({ ...f, estadoFila: f.estadoFila === "buscando" ? "idle" : f.estadoFila })) : filasVacias());
      })
      .catch(() => setFilas(filasVacias()))
      .finally(() => { listoParaGuardar.current = true; setCargandoBorrador(false); });
  }, [origen]);

  // Autoguardado (con debounce) del borrador completo en BD.
  useEffect(() => {
    if (!listoParaGuardar.current) return;
    const id = setTimeout(() => {
      guardarBorradorPlantillaTat(origen, filas).then((r) => { jornadaRef.current = r.jornada; }).catch(() => { /* se reintenta en el próximo cambio */ });
    }, 800);
    return () => clearTimeout(id);
  }, [filas, origen]);

  // Revisa cada minuto si el servidor ya cruzó el corte de las 6:00 p. m.; si
  // es así, arranca una jornada nueva en blanco (el proceso es diario).
  useEffect(() => {
    const id = setInterval(() => {
      getBorradorPlantillaTat<FilaEdit>(origen).then((r) => {
        if (jornadaRef.current && r.jornada !== jornadaRef.current) {
          jornadaRef.current = r.jornada;
          setFilas(r.filas.length > 0 ? r.filas : filasVacias());
          showToast("Nueva jornada: la plantilla se reinició (se borra todos los días a las 6:00 p. m.).", "success");
        }
      }).catch(() => { /* ignora fallas de la revisión periódica */ });
    }, 60_000);
    return () => clearInterval(id);
  }, [origen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selección de rango tipo Excel: arrastrar el mouse sobre las celdas marca
  // el rango; Ctrl+C sobre un rango de más de una celda copia todo el bloque
  // como TSV (una sola celda deja el copiado nativo del input, para no romper
  // el copiar un pedazo de texto dentro de una celda).
  useEffect(() => {
    function onMouseUp() { draggingRef.current = false; }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  function iniciarSeleccion(r: number, c: number) {
    draggingRef.current = true;
    setSel({ r0: r, c0: c, r1: r, c1: c });
  }
  function extenderSeleccion(r: number, c: number) {
    if (!draggingRef.current) return;
    setSel((s) => (s ? { ...s, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c }));
  }
  function rangoSel() {
    if (!sel) return null;
    return { rMin: Math.min(sel.r0, sel.r1), rMax: Math.max(sel.r0, sel.r1), cMin: Math.min(sel.c0, sel.c1), cMax: Math.max(sel.c0, sel.c1) };
  }
  function enSeleccion(r: number, c: number) {
    const rango = rangoSel();
    if (!rango) return false;
    return r >= rango.rMin && r <= rango.rMax && c >= rango.cMin && c <= rango.cMax;
  }
  function onCopyRango(e: React.ClipboardEvent) {
    const rango = rangoSel();
    if (!rango || (rango.rMin === rango.rMax && rango.cMin === rango.cMax)) return; // una sola celda: copia nativa del input
    const texto = [];
    for (let r = rango.rMin; r <= rango.rMax; r++) {
      const fila = filas[r];
      if (!fila) continue;
      const cols = [];
      for (let c = rango.cMin; c <= rango.cMax; c++) cols.push(getValor(fila, columnas[c]));
      texto.push(cols.join("\t"));
    }
    e.clipboardData.setData("text/plain", texto.join("\n"));
    e.preventDefault();
  }

  // Auto-scroll tipo Excel: si mientras arrastras la selección el mouse queda
  // cerca del borde del contenedor (o de la ventana), se desplaza solo.
  function onArrastrarCerca(e: React.MouseEvent) {
    if (!draggingRef.current) return;
    const cont = contenedorRef.current;
    if (!cont) return;
    const rect = cont.getBoundingClientRect();
    const MARGEN = 40, PASO = 24;
    if (e.clientX - rect.left < MARGEN) cont.scrollLeft -= PASO;
    else if (rect.right - e.clientX < MARGEN) cont.scrollLeft += PASO;
    if (e.clientY < MARGEN + 80) window.scrollBy(0, -PASO);
    else if (window.innerHeight - e.clientY < MARGEN) window.scrollBy(0, PASO);
  }

  const nombresConductores = [...new Set(conductores.map((c) => `${c.nombres} ${c.apellidos}`.trim()))];
  const placas = [...new Set(vehiculos.map((v) => v.placa))];
  const nombresRutas = [...new Set(rutas.map((r) => r.nombre))];
  const nombresAuxiliares = [...new Set(auxiliares.map((a) => a.nombre))];
  const nombresClientes = [...new Set(clientesTat.map((c) => c.cliente).filter(Boolean) as string[])];
  const OPCIONES: Partial<Record<TipoCol, string[]>> = {
    placa: placas, conductor: nombresConductores, ruta: nombresRutas, auxiliar: nombresAuxiliares, cliente: nombresClientes,
  };

  function setFila(i: number, patch: Partial<FilaEdit>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function agregarFila() {
    setFilas((prev) => [...prev, filaNueva()]);
  }
  function quitarFila(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Cruza una fila contra Siesa (misma lógica que "Guardar") y autorellena en
  // la grilla los campos que sí vienen de la remisión (nit/cliente/kilos/
  // valor/barrio) sin pisar lo que el usuario ya haya escrito a mano.
  async function cruzarDatos(i: number, fila: FilaEdit) {
    if (!fila.fecha.trim() || !fila.numFac.trim()) return;
    setFila(i, { estadoFila: "buscando", mensaje: undefined });
    try {
      const input: FilaPlantillaTat = {
        fecha: fila.fecha, numFac: fila.numFac, placa: fila.placa || null, conductor: fila.conductor || null,
        auxiliar: fila.auxiliar || null, ruta: fila.ruta || null, extra: fila.extra,
      };
      const r = await subirPlantillaTat(origen, [input]);
      const det = r.detalle[0];
      if (det?.estado === "CRUZADO") {
        setFilas((prev) => prev.map((f, idx) => {
          if (idx !== i) return f;
          const extra = { ...f.extra };
          if (origen === "AGROPECUARIA") {
            if (det.nit) extra.nit = det.nit;
            if (det.totalValor != null) extra.dinero = String(det.totalValor);
            if (det.totalKg != null) extra.kilo = String(det.totalKg);
          } else {
            if (det.barrio) extra.barrio = det.barrio;
            if (det.totalValor != null) extra.valor = String(det.totalValor);
            if (!extra.mes) extra.mes = mesDeFecha(f.fecha);
          }
          if (det.cliente) extra[CAMPO_CLIENTE_EXTRA[origen]] = det.cliente;
          return { ...f, extra, cliente: det.cliente ?? f.cliente, estadoFila: "ok", mensaje: det.mensaje };
        }));
      } else {
        setFila(i, { estadoFila: "error", mensaje: det?.mensaje });
      }
    } catch (err) {
      setFila(i, { estadoFila: "error", mensaje: err instanceof Error ? err.message : "Error desconocido" });
    }
  }

  // Copia/pega tipo Excel: al pegar un bloque de varias celdas/filas, se
  // reparte celda por celda EN EL MISMO ORDEN DE COLUMNAS de la plantilla,
  // creando filas nuevas si el bloque pegado trae más de las que hay, y
  // dispara el cruce con Siesa para cada fila que quede con fecha+factura.
  function onPasteCelda(e: React.ClipboardEvent, filaIdx: number, colIdx: number) {
    const texto = e.clipboardData.getData("text");
    if (!texto.includes("\t") && !texto.includes("\n")) return; // una sola celda: comportamiento normal del input
    e.preventDefault();
    const lineas = texto.replace(/\r/g, "").split("\n");
    while (lineas.length > 0 && lineas[lineas.length - 1] === "") lineas.pop();

    setFilas((prev) => {
      const next = [...prev];
      const afectadas: number[] = [];
      lineas.forEach((linea, r) => {
        const destino = filaIdx + r;
        while (next.length <= destino) next.push(filaNueva());
        let fila = next[destino];
        linea.split("\t").forEach((valor, c) => {
          const col = columnas[colIdx + c];
          if (!col) return;
          fila = conValor(fila, col, valor.trim(), origen, OPCIONES);
        });
        next[destino] = fila;
        afectadas.push(destino);
      });
      setTimeout(() => { afectadas.forEach((idx) => cruzarDatos(idx, next[idx])); }, 0);
      return next;
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const nuevas: FilaEdit[] = rows.map((row) => {
      let fila = filaNueva();
      for (const col of columnas) {
        const crudo = row[col.header];
        const valor = col.tipo === "fecha" ? fechaExcelATexto(crudo) : String(crudo ?? "").trim();
        fila = conValor(fila, col, valor, origen, OPCIONES);
      }
      return fila;
    }).filter((f) => f.numFac);
    if (nuevas.length === 0) { showToast("El archivo no tiene filas con número de factura", "error"); return; }
    setFilas(nuevas);
    showToast(`${nuevas.length} filas cargadas del Excel. Revisa y da clic en Guardar.`, "success");
  }

  // Si ya hay filas con datos capturados, el Excel sale con esos datos (para
  // que puedan seguir usándolo como venían haciéndolo); si la grilla está
  // vacía, sale el formato en blanco con solo los encabezados.
  function exportarExcel() {
    const headers = columnas.map((c) => c.header);
    const conDatos = filas.filter((f) => f.fecha.trim() || f.numFac.trim());
    const filasExcel = conDatos.map((f) => columnas.map((c) => getValor(f, c)));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...filasExcel]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, `plantilla-tat-${origen.toLowerCase()}.xlsx`);
  }

  // Copia la grilla completa (encabezados + filas) al portapapeles como TSV,
  // para pegarla de vuelta en Excel tal cual (Ctrl+V allá).
  async function copiarTodo() {
    const headers = columnas.map((c) => c.header).join("\t");
    const dataRows = filas.map((f) => columnas.map((c) => getValor(f, c)).join("\t"));
    try {
      await navigator.clipboard.writeText([headers, ...dataRows].join("\n"));
      showToast("Tabla copiada — pégala en Excel con Ctrl+V.", "success");
    } catch {
      showToast("No se pudo copiar al portapapeles", "error");
    }
  }

  async function guardar() {
    const pendientes = filas.filter((f) => f.fecha.trim() && f.numFac.trim());
    if (pendientes.length === 0) { showToast("Completa al menos fecha y factura en una fila.", "error"); return; }
    setGuardando(true);
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (!f.fecha.trim() || !f.numFac.trim()) continue;
      await cruzarDatos(i, f);
    }
    setGuardando(false);
    showToast("Proceso terminado. Revisa el estado de cada fila.", "success");
  }

  return (
    <div className="p-6">
      {!puedeVer ? (
        <>
          <PageHeader icon={IconUpload} title={titulo} subtitle={subtitulo} />
          <div className="rounded-2xl border border-[#e1e9dd] bg-white">
            <EmptyState icon={IconUpload} title="Sin acceso" description="No tienes permiso para ver este módulo." />
          </div>
        </>
      ) : (
      <>
      <PageHeader
        icon={IconUpload}
        title={titulo}
        subtitle={subtitulo}
        actions={
          <div className="flex items-center gap-2">
            {!puedeEditar && <SoloLecturaBadge />}
            <button onClick={copiarTodo} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              Copiar tabla
            </button>
            <button
              onClick={exportarExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4e0] bg-white px-4 py-2.5 text-sm font-medium text-[#45505e] hover:bg-[#f4f6f3]"
            >
              {IconDownload} Descargar Excel
            </button>
            {puedeEditar && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#2f8f4e] bg-[#e8f3e2] px-4 py-2.5 text-sm font-medium text-[#2f8f4e] hover:bg-[#dcedd3]">
              {IconUpload} Subir Excel
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" />
            </label>
            )}
          </div>
        }
      />

      <p className="mb-3 text-xs text-[#7a8794]">
        Puedes seleccionar y pegar (Ctrl+V) un bloque de celdas copiado directamente de tu Excel, o arrastrar el mouse sobre varias celdas y copiarlas (Ctrl+C) para pegarlas en Excel o en otra parte de la tabla — las columnas están en el mismo orden que la plantilla. Al escribir la fecha y la factura, se autorellenan los datos que vienen de la remisión en Siesa.
      </p>

      <fieldset disabled={!puedeEditar} className="contents">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={guardar} disabled={guardando} className="ml-auto rounded-lg bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#277a42] disabled:opacity-60">
          {guardando ? "Procesando…" : "Guardar y cruzar con Siesa"}
        </button>
      </div>

      {cargandoBorrador ? (
        <div className="flex items-center justify-center rounded-lg border border-[#c7d0d3] bg-white py-16 text-sm text-[#7a8794]">Cargando lo que ya se había guardado…</div>
      ) : (
      <div ref={contenedorRef} className="overflow-x-auto rounded-lg border border-[#c7d0d3] bg-white" onCopy={onCopyRango} onMouseMove={onArrastrarCerca}>
        <table className="w-full select-none border-collapse text-xs">
          <thead className="bg-[#f1f3f4] text-left font-semibold text-[#3c4043]">
            <tr>
              {columnas.map((c) => <th key={c.header} className="whitespace-nowrap border border-[#d7dbdd] px-2 py-1.5">{c.header}</th>)}
              <th className="border border-[#d7dbdd] px-2 py-1.5">Estado</th>
              <th className="w-10 border border-[#d7dbdd]"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="even:bg-[#fafbfa]">
                {columnas.map((col, colIdx) => (
                  <td
                    key={col.header}
                    className={`border p-0 ${enSeleccion(i, colIdx) ? "border-[#2f8f4e] bg-[#e8f3e2]/60" : "border-[#e5e9ea]"}`}
                    onMouseDown={() => iniciarSeleccion(i, colIdx)}
                    onMouseEnter={() => extenderSeleccion(i, colIdx)}
                  >
                    {col.tipo === "fecha" ? (
                      <input
                        type="date" value={f.fecha}
                        onChange={(e) => setFila(i, { fecha: e.target.value })}
                        onBlur={() => cruzarDatos(i, filas[i])}
                        onPaste={(e) => onPasteCelda(e, i, colIdx)}
                        className="w-32 border-2 border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-[#2f8f4e] focus:bg-[#f0f9f4]"
                      />
                    ) : col.tipo === "factura" ? (
                      <input
                        value={f.numFac} placeholder="24808"
                        onChange={(e) => setFila(i, { numFac: e.target.value })}
                        onBlur={() => cruzarDatos(i, filas[i])}
                        onPaste={(e) => onPasteCelda(e, i, colIdx)}
                        className="w-24 border-2 border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-[#2f8f4e] focus:bg-[#f0f9f4]"
                      />
                    ) : col.tipo === "texto" ? (
                      <input
                        value={f.extra[col.campo!] ?? ""}
                        onChange={(e) => setFila(i, { extra: { ...f.extra, [col.campo!]: e.target.value } })}
                        onPaste={(e) => onPasteCelda(e, i, colIdx)}
                        className="w-24 border-2 border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-[#2f8f4e] focus:bg-[#f0f9f4]"
                      />
                    ) : (
                      <Combobox
                        valor={getValor(f, col)}
                        onChange={(v) => setFilas((prev) => prev.map((ff, idx) => (idx === i ? conValor(ff, col, v, origen) : ff)))}
                        onCanonizar={(v) => setFilas((prev) => prev.map((ff, idx) => (idx === i ? conValor(ff, col, v, origen, OPCIONES) : ff)))}
                        opciones={OPCIONES[col.tipo] ?? []}
                        placeholder={col.header}
                        onPasteCelda={(e) => onPasteCelda(e, i, colIdx)}
                      />
                    )}
                  </td>
                ))}
                <td className="border border-[#e5e9ea] px-2 py-1">
                  {f.estadoFila !== "idle" && (
                    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium ${ESTADO_PILL[f.estadoFila]}`} title={f.mensaje}>
                      {f.estadoFila === "buscando" && <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10" opacity="0.25" /><path d="M22 12a10 10 0 0 0-10-10" /></svg>}
                      {ESTADO_LABEL[f.estadoFila]}
                    </span>
                  )}
                </td>
                <td className="border border-[#e5e9ea] p-1 text-center">
                  {filas.length > 1 && (
                    <button
                      onClick={() => quitarFila(i)}
                      title="Eliminar fila"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9aa4af] transition-colors hover:bg-[#fbeceb] hover:text-[#b3261e]"
                    >
                      {IconTrash}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={columnas.length + 2} className="border border-[#e5e9ea] p-0">
                <button onClick={agregarFila} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-[#5f7a68] hover:bg-[#f0f9f4] hover:text-[#2f8f4e]">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Agregar fila
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}
      </fieldset>
      </>
      )}
    </div>
  );
}

// Selector buscable: escribe para filtrar, elige de la lista con clic o
// teclado, y marca "no creado" si el valor no coincide con nada del maestro
// (comparando sin tildes/espacios/guiones/mayúsculas). Al salir del campo,
// si hubo match, el valor se canoniza a la forma exacta que está en la BD.
function Combobox({ valor, onChange, onCanonizar, opciones, placeholder, onPasteCelda }: {
  valor: string; onChange: (v: string) => void; onCanonizar?: (v: string) => void; opciones: string[]; placeholder: string;
  onPasteCelda?: (e: React.ClipboardEvent) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canonico = buscarCanonico(valor, opciones);
  const existe = canonico !== null;

  // El dropdown se pinta en un portal fijo a la ventana (no dentro de la
  // celda) para que no quede recortado ni haga scroll junto con la tabla.
  function actualizarPosicion() {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom, width: Math.max(r.width, 160) });
  }

  useEffect(() => {
    if (!abierto) return;
    actualizarPosicion();
    function onScrollOrResize() { actualizarPosicion(); }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [abierto]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const filtradas = opciones.filter((o) => normalizarComparacion(o).includes(normalizarComparacion(valor))).slice(0, 30);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          value={valor}
          onChange={(e) => { onChange(e.target.value); setAbierto(true); setResaltado(0); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => { if (canonico && canonico !== valor) (onCanonizar ?? onChange)(canonico); }}
          onPaste={onPasteCelda}
          onKeyDown={(e) => {
            if (!abierto || filtradas.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setResaltado((r) => Math.min(r + 1, filtradas.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setResaltado((r) => Math.max(r - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); onChange(filtradas[resaltado]); setAbierto(false); }
            else if (e.key === "Escape") setAbierto(false);
          }}
          placeholder={placeholder}
          className="w-28 border-2 border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-[#2f8f4e] focus:bg-[#f0f9f4]"
        />
        {valor.trim() && !existe && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#fdf6e9] px-1.5 py-0.5 text-[9px] font-semibold text-[#a86a12]" title="No existe en la base de datos todavía">no creado</span>
        )}
      </div>
      {abierto && filtradas.length > 0 && rect && createPortal(
        <div
          className="fixed z-50 max-h-40 overflow-y-auto rounded-lg border border-[#dfe4e0] bg-white py-1 shadow-lg"
          style={{ left: rect.left, top: rect.top, width: rect.width }}
        >
          {filtradas.map((o, idx) => (
            <button
              key={o}
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setAbierto(false); }}
              className={`block w-full truncate px-2 py-1.5 text-left text-xs ${idx === resaltado ? "bg-[#f0f9f4] text-[#2f8f4e]" : "hover:bg-[#f4f6f3]"}`}
            >
              {o}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

