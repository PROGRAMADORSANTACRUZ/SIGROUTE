// Documentos imprimibles de Diagrama: consolidado por ruta (2 variantes, TAT e
// Inversiones) y remisiones individuales de una ruta (plantilla TAT
// Agropecuaria), un solo documento HTML con salto de página por remisión.
// Mismo patrón que lib/planillaDocs.ts (HTML + window.print(), sin pdfkit).
import type { Orden, VehiculoExterno } from "@/lib/api";
import { tc } from "@/lib/utils";
import QRCode from "qrcode";

const baseHref = (): string =>
  typeof window !== "undefined" ? `<base href="${window.location.origin}/"/>` : "";

// Siesa/DIAN formatea sus documentos en estilo "en-US" (coma de miles, punto
// decimal), no "es-CO" (verificado contra facturas reales) — se replica igual
// aquí para que los formatos impresos queden exactamente iguales.
const fmtKg = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtMoney = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fechaHoy(): string {
  return new Date().toLocaleDateString("es-CO");
}

// Datos fijos de encabezado por razón social (solo lo confirmado por el
// usuario con una factura real; lo que no se conoce se deja en blanco).
const EMPRESAS: Record<string, { nombre: string; nit: string; direccion: string; telefono: string; ciudad: string; email: string }> = {
  INVERSIONES: { nombre: "INVERSIONES SERRANO MILLAN S.A.S", nit: "900391505-9", direccion: "CALLE 4 #2-21", telefono: "3106115649", ciudad: "Malambo", email: "COMERCIAL@CFSANTACRUZ.COM" },
  AGROPECUARIA: { nombre: "AGROPECUARIA SANTACRUZ LIMITADA", nit: "830505537", direccion: "", telefono: "", ciudad: "", email: "" },
};

function empresaDe(distribucion: string) {
  return EMPRESAS[distribucion] ?? EMPRESAS.AGROPECUARIA;
}

// Fecha "DD/MM/YYYY" (formato con el que se guarda Orden.fecha) + N días,
// devuelta en "YYYY/MM/DD" (formato en el que Siesa imprime sus facturas).
function sumarDiasDMY(fecha: string, dias: number): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(fecha.trim());
  if (!m) return fecha;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// "DD/MM/YYYY" -> "YYYY/MM/DD" (formato de fecha de las facturas Siesa).
function dmyToYmdSlash(fecha: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(fecha.trim());
  if (!m) return fecha;
  return `${m[3]}/${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}`;
}

// "DD/MM/YYYY" -> "YYYY-MM-DD" (formato de fecha de los consolidados en papel).
function dmyToIso(fecha: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(fecha.trim());
  if (!m) return fecha;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// Fecha a mostrar en el consolidado: la del despacho/factura de las órdenes
// (no la de "hoy" al imprimir) — prioriza fechaDespacho si se reescribió.
function fechaConsolidado(ordenes: Orden[]): string {
  const primera = ordenes[0];
  if (!primera) return fechaHoy();
  if (primera.fechaDespacho) return primera.fechaDespacho.slice(0, 10);
  return primera.fecha ? dmyToIso(primera.fecha) : fechaHoy();
}

// Igual que fechaConsolidado() pero en "DD/MM/YYYY" (formato del consolidado TAT en papel).
function fechaConsolidadoDMY(ordenes: Orden[]): string {
  const primera = ordenes[0];
  if (!primera) return new Date().toLocaleDateString("es-CO");
  if (primera.fechaDespacho) {
    const d = new Date(primera.fechaDespacho);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return primera.fecha || new Date().toLocaleDateString("es-CO");
}

// Re-dibuja como SVG el QR exacto que se escaneó de la factura física (mismo
// texto, mismo contenido) — no se inventa nada, solo se re-renderiza el
// bit-matrix que resulta de codificar otra vez ese mismo texto verificado.
function qrSvg(texto: string, size = 96): string {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  let rects = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(row, col)) {
        rects += `<rect x="${(col * cell).toFixed(2)}" y="${(row * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

// ── Valor en letras (pesos colombianos) ─────────────────────────────────────
const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
function letraUnidad(n: number): string { return UNIDADES[n] ?? ""; }
function letraDecena(n: number): string {
  const decena = Math.floor(n / 10);
  const unidad = n - decena * 10;
  const conY = (base: string) => (unidad > 0 ? `${base} Y ${letraUnidad(unidad)}` : base);
  switch (decena) {
    case 1:
      return ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"][unidad];
    case 2:
      return unidad === 0 ? "VEINTE" : `VEINTI${letraUnidad(unidad)}`;
    case 3: return conY("TREINTA");
    case 4: return conY("CUARENTA");
    case 5: return conY("CINCUENTA");
    case 6: return conY("SESENTA");
    case 7: return conY("SETENTA");
    case 8: return conY("OCHENTA");
    case 9: return conY("NOVENTA");
    default: return letraUnidad(unidad);
  }
}
function letraCentena(n: number): string {
  const centena = Math.floor(n / 100);
  const resto = n - centena * 100;
  const nombres = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
  if (centena === 1 && resto === 0) return "CIEN";
  const base = nombres[centena];
  return resto > 0 ? `${base} ${letraDecena(resto)}`.trim() : base;
}
function letraMiles(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n - miles * 1000;
  let strMiles = "";
  if (miles === 1) strMiles = "MIL";
  else if (miles > 1) strMiles = `${letraCentena(miles)} MIL`;
  const strResto = letraCentena(resto);
  return [strMiles, strResto].filter(Boolean).join(" ");
}
function letraMillones(n: number): string {
  const millones = Math.floor(n / 1000000);
  const resto = n - millones * 1000000;
  let strMillones = "";
  if (millones === 1) strMillones = "UN MILLON";
  else if (millones > 1) strMillones = `${letraCentena(millones)} MILLONES`;
  const strResto = letraMiles(resto);
  return [strMillones, strResto].filter(Boolean).join(" ");
}
// Convierte un valor monetario a letras, ej. 53994.15 -> "CINCUENTA Y TRES MIL
// NOVECIENTOS NOVENTA Y CUATRO PESOS CON QUINCE CENTAVOS M/CTE".
function valorEnLetras(valor: number): string {
  const enteros = Math.floor(Math.max(0, valor));
  const centavos = Math.round((valor - enteros) * 100);
  if (enteros === 0 && centavos === 0) return "CERO PESOS M/CTE";
  const letrasEnteros = enteros > 0 ? `${letraMillones(enteros)} PESOS` : "";
  const letrasCentavos = centavos > 0 ? `CON ${letraMillones(centavos)} CENTAVOS` : "";
  return [letrasEnteros, letrasCentavos].filter(Boolean).join(" ").trim() + " M/CTE";
}

// Nombre de la ruta a mostrar en los documentos: el que traigan las órdenes
// (campo Orden.ruta, ej. "RUTA 3") o, si ninguna lo tiene, la placa del vehículo.
function nombreRuta(vehiculo: VehiculoExterno, ordenes: Orden[]): string {
  const conRuta = ordenes.find((o) => o.ruta?.trim());
  return conRuta?.ruta?.trim() || `Vehículo ${vehiculo.placa}`;
}

const CSS_BASE = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; margin: 0; padding: 16px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #333; padding: 3px 5px; vertical-align: middle; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  h2 { font-size: 12px; margin: 0 0 10px; font-weight: normal; color: #333; }
  .page { page-break-after: always; padding-bottom: 4px; }
  .page:last-child { page-break-after: auto; }
  @media print { body { padding: 6px; } }
`;

// ── Consolidado Inversiones (Referencia / Descripción / Cantidad) ──────────
// Nota: nuestro sistema solo guarda kilos por producto (Orden.cantidadKg), no
// un conteo de unidades; la columna "Cantidad" muestra kg como mejor proxy
// disponible, no unidades físicas como en el formato original en papel.
export function docConsolidadoInversiones(vehiculo: VehiculoExterno, ordenes: Orden[]): string {
  const porProducto = new Map<string, { referencia: string; descripcion: string; cantidad: number }>();
  for (const o of ordenes) {
    const m = /^(\d{2,})\s*[-–]?\s*(.+)$/.exec(o.producto.trim());
    const referencia = m ? m[1] : "";
    const descripcion = (m ? m[2] : o.producto).trim();
    const key = `${referencia}|${descripcion}`;
    const ex = porProducto.get(key);
    if (ex) ex.cantidad += o.cantidadKg;
    else porProducto.set(key, { referencia, descripcion, cantidad: o.cantidadKg });
  }
  const filas = Array.from(porProducto.values()).sort((a, b) => a.referencia.localeCompare(b.referencia));
  const ruta = nombreRuta(vehiculo, ordenes);

  return `<!doctype html><html><head><meta charset="utf-8">${baseHref()}<title>Consolidado ${esc(ruta)}</title><style>${CSS_BASE}</style></head>
  <body onload="setTimeout(function(){window.focus();window.print();},350)">
    <div class="page">
      <h1>Formato consolidado de Despacho ruta: ${esc(ruta)}</h1>
      <h2>Fecha: ${fechaConsolidado(ordenes)}</h2>
      <table>
        <thead><tr><th style="width:90px">Referencia</th><th>Descripción</th><th style="width:90px">Cantidad</th></tr></thead>
        <tbody>
          ${filas.map((f) => `<tr><td>${esc(f.referencia)}</td><td>${esc(f.descripcion)}</td><td style="text-align:right">${fmtInt(f.cantidad)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </body></html>`;
}

// ── Consolidado TAT (No.Factura / Vendedor / Cliente / Dinero / Kilos) ─────
// Réplica del formato en papel: columna de fila (#) separada de "No. Factura",
// cliente/vendedor en MAYÚSCULAS (igual que el original, sin tc()), columna
// "NG" sombreada, caja RUTA/FECHA con el nombre de ruta y fecha en DD/MM/YYYY.
export function docConsolidadoTat(vehiculo: VehiculoExterno, ordenes: Orden[]): string {
  type Fila = { numeroOrden: string; vendedor: string; cliente: string; dinero: number; kilo: number };
  const porFactura = new Map<string, Fila>();
  for (const o of ordenes) {
    const ex = porFactura.get(o.numeroOrden);
    if (ex) { ex.dinero += o.valor; ex.kilo += o.cantidadKg; }
    else porFactura.set(o.numeroOrden, { numeroOrden: o.numeroOrden, vendedor: o.vendedor ?? "", cliente: o.cliente, dinero: o.valor, kilo: o.cantidadKg });
  }
  const filas = Array.from(porFactura.values());
  const totalDinero = filas.reduce((s, f) => s + f.dinero, 0);
  const totalKilo = filas.reduce((s, f) => s + f.kilo, 0);
  const ruta = nombreRuta(vehiculo, ordenes);

  return `<!doctype html><html><head><meta charset="utf-8">${baseHref()}<title>Consolidado TAT ${esc(ruta)}</title><style>${CSS_BASE}
    .env { width: 26px; text-align: center; }
    .env.ng { background: #d9d9d9; }
    .num { width: 24px; text-align: center; }
    .cabecera { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; gap: 12px; }
    .cab-izq { font-size: 11px; line-height: 1.6; }
    .cab-der { width: 240px; border-collapse: collapse; }
    .cab-der td { border: 1px solid #333; padding: 3px 6px; font-size: 11px; }
    .cab-der .lbl { font-weight: bold; width: 70px; background: #f4f6f3; }
    .cab-der .val { font-weight: bold; font-size: 13px; }
  </style></head>
  <body onload="setTimeout(function(){window.focus();window.print();},350)">
    <div class="page">
      <div class="cabecera">
        <div class="cab-izq"><div><b>CONDUCTOR:</b> ${esc(vehiculo.conductor ?? "")}</div><div><b>AUXILIAR:</b></div></div>
        <table class="cab-der">
          <tr><td class="lbl">RUTA</td><td class="val">${esc(ruta)}</td></tr>
          <tr><td class="lbl">FECHA</td><td class="val">${esc(fechaConsolidadoDMY(ordenes))}</td></tr>
        </table>
      </div>
      <table>
        <thead>
          <tr>
            <th class="num">#</th><th>No. Factura</th><th>Vendedor</th><th>Clientes</th><th>Dinero</th><th>Kilo Fac.</th><th>Kilo Des.</th>
            <th class="env">Und</th><th class="env">AZ</th><th class="env ng">NG</th><th class="env">RJ</th><th class="env">GR</th><th class="env">VD</th><th class="env">Caja</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map((f, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td>${esc(f.numeroOrden)}</td>
            <td>${esc(f.vendedor)}</td>
            <td>${esc(f.cliente)}</td>
            <td style="text-align:right">$ ${fmtMoney(f.dinero)}</td>
            <td style="text-align:right">${fmtKg(f.kilo)}</td>
            <td style="text-align:right"></td>
            <td class="env"></td><td class="env"></td><td class="env ng"></td><td class="env"></td><td class="env"></td><td class="env"></td><td class="env"></td>
          </tr>`).join("")}
          <tr>
            <td colspan="4" style="text-align:right"><b>TOTAL DESPACHO</b></td>
            <td style="text-align:right"><b>$ ${fmtMoney(totalDinero)}</b></td>
            <td style="text-align:right"><b>${fmtKg(totalKilo)}</b></td>
            <td colspan="8"></td>
          </tr>
        </tbody>
      </table>
    </div>
  </body></html>`;
}

// ── Remisiones individuales de la ruta (estilo factura Siesa: TAT Agropecuaria
// e Inversiones Serrano Millán usan el mismo formato, cambia solo el
// encabezado de razón social/NIT) ──────────────────────────────────────────
// Una página por remisión (numeroOrden), con salto de página entre ellas, para
// que la impresora conectada las saque una tras otra en un solo trabajo.
// CUFE/QR/firma digital: para TAT/Inversiones ahora vienen directo de Siesa
// (confirmado en vivo 2026-09-24, vía t305_co_cfd) al cargar la factura —
// Orden.cufe/qrTexto/firmaDigital ya no dependen de escanear la factura
// física (eso queda como respaldo si Siesa aún no los tiene para esa
// factura). El QR impreso aquí re-codifica exactamente ese mismo texto/URL
// (no se inventa nada). En órdenes cargadas por Excel (Bovino/Porcino) esos
// campos no existen todavía y se muestra un aviso honesto en su lugar.
export function docRemisionesRuta(vehiculo: VehiculoExterno, ordenes: Orden[]): string {
  const porRemision = new Map<string, Orden[]>();
  for (const o of ordenes) {
    const arr = porRemision.get(o.numeroOrden) ?? [];
    arr.push(o);
    porRemision.set(o.numeroOrden, arr);
  }

  const paginas = Array.from(porRemision.entries()).map(([numeroOrden, lineas]) => {
    const primera = lineas[0];
    const totalKg = lineas.reduce((s, l) => s + l.cantidadKg, 0);
    const totalValor = lineas.reduce((s, l) => s + l.valor, 0);
    const empresa = empresaDe(primera.distribucion);
    const vcto = primera.fecha ? sumarDiasDMY(primera.fecha, 1) : "—";
    const verificada = Boolean(primera.cufe && primera.qrTexto);

    const filas = lineas.map((l, i) => {
      const m = /^(\d{2,})\s*[-–]?\s*(.+)$/.exec(l.producto.trim());
      const referencia = m ? m[1] : "—";
      const descripcion = m ? m[2] : l.producto;
      const precioUnit = l.cantidadKg > 0 ? l.valor / l.cantidadKg : 0;
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(referencia)}</td>
        <td>${esc(descripcion)}</td>
        <td>—</td>
        <td style="text-align:right">${fmtMoney(l.cantidadKg)}</td>
        <td style="text-align:center">KG</td>
        <td style="text-align:right">$${fmtMoney(precioUnit)}</td>
        <td style="text-align:center">—</td>
        <td style="text-align:center">—</td>
        <td style="text-align:center">—</td>
        <td style="text-align:right">$${fmtMoney(l.valor)}</td>
      </tr>`;
    }).join("");

    return `<div class="page">
      <table class="header">
        <tr>
          <td style="border:none;width:60%">
            <div class="empresa">${esc(empresa.nombre)}</div>
            <div class="chico">NIT. ${esc(empresa.nit)}</div>
            ${empresa.direccion ? `<div class="chico">${esc(empresa.direccion)}${empresa.ciudad ? ` · ${esc(empresa.ciudad)}` : ""}</div>` : ""}
            ${empresa.telefono ? `<div class="chico">${esc(empresa.telefono)}</div>` : ""}
            ${empresa.email ? `<div class="chico">${esc(empresa.email)}</div>` : ""}
          </td>
          <td style="border:none;text-align:right;vertical-align:top">
            <div class="titulo">FACTURA ELECTRÓNICA</div>
            <div class="chico">${esc(numeroOrden)}</div>
            <div class="chico">Página: 1 de 1</div>
            ${verificada
              ? `<div class="chico" style="margin-top:4px;color:#2f8f4e">CUFE verificado ✓</div>`
              : `<div class="chico" style="margin-top:4px;color:#a33">Sin CUFE/QR — no hay factura Siesa asociada a esta remisión</div>`}
          </td>
        </tr>
      </table>
      <table class="infobox">
        <tr><td class="lbl">Señor (es):</td><td colspan="3">${esc(tc(primera.cliente))}</td></tr>
        <tr>
          <td class="lbl">Nit o C.C.:</td><td>${esc(primera.nit ?? "—")}</td>
          <td class="lbl">Forma de Pago:</td><td>CONTADO</td>
        </tr>
        <tr>
          <td class="lbl">Dirección:</td><td>${esc(primera.direccion ?? "—")}</td>
          <td class="lbl">Medio de Pago:</td><td>CONTADO</td>
        </tr>
        <tr>
          <td class="lbl">Ciudad:</td><td>${esc(tc(primera.destino))}</td>
          <td class="lbl">Vendedor:</td><td>${esc(primera.vendedor ?? "—")}</td>
        </tr>
        <tr>
          <td class="lbl">Transportador:</td><td>${esc(vehiculo.conductor ?? "—")} · ${esc(vehiculo.placa)}</td>
          <td class="lbl">Fecha Factura:</td><td>${esc(primera.fecha ? dmyToYmdSlash(primera.fecha) : "—")}</td>
        </tr>
        <tr>
          <td class="lbl">No. Remisión:</td><td>${esc(numeroOrden)}</td>
          <td class="lbl">Fecha de Vcto:</td><td>${esc(vcto)}</td>
        </tr>
        <tr>
          <td class="lbl">Nro. Pedido:</td><td>${esc(primera.codigo ?? numeroOrden)}</td>
          <td class="lbl">Ruta:</td><td>${esc(nombreRuta(vehiculo, lineas))}</td>
        </tr>
      </table>
      <table>
        <thead>
          <tr>
            <th style="width:24px">Nro</th><th style="width:50px">REF</th><th>Descripción</th><th style="width:45px">Lote</th>
            <th style="width:60px">Cantidad</th><th style="width:32px">U.M.</th><th style="width:75px">Precio Unit</th>
            <th style="width:40px">Dscto</th><th style="width:40px">Ipcu</th><th style="width:32px">IVA %</th><th style="width:90px">Valor Total</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
      </table>
      <table class="totales">
        <tr>
          <td class="lbl">Total Cantidad</td><td>${fmtInt(totalKg)}</td>
          <td class="lbl">Sub-Total</td><td>$${fmtMoney(totalValor)}</td>
          <td class="lbl">Total</td><td><b>$${fmtMoney(totalValor)}</b></td>
        </tr>
      </table>
      <p class="letras"><b>Valor Letras:</b> ${esc(valorEnLetras(totalValor))}</p>
      <p class="letras"><b>Observaciones:</b> —</p>
      <table class="pie">
        <tr>
          <td style="border:none;width:110px;vertical-align:top">
            ${verificada
              ? `${qrSvg(primera.qrTexto!)}<div class="chico" style="text-align:center">Escanee para validar</div>`
              : `<div class="chico">QR no disponible<br/>(sin factura Siesa asociada)</div>`}
          </td>
          <td style="border:none;vertical-align:top">
            <div class="chico"><b>CUFE:</b> ${verificada ? esc(primera.cufe) : "No disponible en esta remisión"}</div>
            <div class="chico" style="margin-top:2px;word-break:break-all"><b>Firma Digital Electrónica:</b> ${primera.firmaDigital ? esc(primera.firmaDigital) : "no disponible en esta remisión (aún no aprobada por la DIAN o cargada por Excel, sin factura Siesa asociada)"}</div>
          </td>
        </tr>
      </table>
      <p class="nota">Documento de despacho interno generado por SigRoute a partir de la remisión ${esc(numeroOrden)}${verificada ? " (CUFE, QR y firma digital verificados directo con Siesa)" : ""} — no reemplaza la factura electrónica oficial certificada por Siesa/DIAN.</p>
    </div>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8">${baseHref()}<title>Remisiones ${esc(vehiculo.placa)}</title><style>${CSS_BASE}
    .header { margin-bottom: 8px; } .header td { border: none; }
    .empresa { font-size: 14px; font-weight: bold; }
    .titulo { font-size: 13px; font-weight: bold; }
    .chico { font-size: 10px; color: #333; }
    .infobox { margin-bottom: 6px; font-size: 10.5px; }
    .infobox td { padding: 2px 5px; }
    .infobox .lbl { font-weight: bold; width: 90px; background: #f4f6f3; }
    .totales { margin-top: 4px; font-size: 10.5px; }
    .totales .lbl { font-weight: bold; background: #f4f6f3; text-align: right; }
    .letras { margin: 4px 0; font-size: 10px; }
    .pie { margin-top: 8px; } .pie td { border: none; }
    .nota { margin-top: 8px; font-size: 9px; color: #666; }
  </style></head>
  <body onload="setTimeout(function(){window.focus();window.print();},350)">
    ${paginas || '<div class="page"><p>Sin remisiones para imprimir.</p></div>'}
  </body></html>`;
}

// Abre el documento en una ventana nueva e imprime (igual que planillaDocs.ts).
export function imprimirDocumentoDiagrama(html: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}
