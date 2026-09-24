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

// Datos fijos de encabezado por razón social (verificados contra facturas
// reales Siesa: FEP65016 para Agropecuaria, FESI25347 para Inversiones).
const EMPRESAS: Record<string, { nombre: string; nit: string; direccion: string; telefono: string; ciudad: string; email: string; logo: string }> = {
  INVERSIONES: { nombre: "INVERSIONES SERRANO MILLAN S.A.S", nit: "900391505-9", direccion: "CALLE 4 #2-21", telefono: "3106115649", ciudad: "Malambo", email: "COMERCIAL@CFSANTACRUZ.COM", logo: "/logos/inversiones-serrano-millan.png" },
  AGROPECUARIA: { nombre: "AGROPECUARIA SANTACRUZ LIMITADA", nit: "830505537", direccion: "CLL 4 2 21", telefono: "", ciudad: "Malambo", email: "", logo: "/logos/agropecuaria-santacruz.png" },
};

// La factura se emite bajo INVERSIONES SERRANO MILLAN solo cuando la orden es
// TAT con tatOrigen INVERSIONES (cia=8 en Siesa); todo lo demás (TAT normal,
// Bovino, Porcino) factura bajo AGROPECUARIA SANTACRUZ LIMITADA (cia=3).
// OJO: antes esta función miraba `distribucion` (que solo vale "AGROPECUARIA"
// o "TAT", nunca "INVERSIONES") y por eso Inversiones NUNCA mostraba su
// propio encabezado — bug real, corregido 2026-09-24.
function empresaDe(o: Orden) {
  if (o.distribucion === "TAT" && o.tatOrigen === "INVERSIONES") return EMPRESAS.INVERSIONES;
  return EMPRESAS.AGROPECUARIA;
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
    // Prefiere el código real de Siesa (productoCodigo, viene con la
    // factura TAT/Inversiones); si no existe (Bovino/Porcino por Excel),
    // cae al viejo truco de leerlo como prefijo del texto del producto.
    let referencia = o.productoCodigo ?? "";
    let descripcion = o.producto.trim();
    if (!referencia) {
      const m = /^(\d{2,})\s*[-–]?\s*(.+)$/.exec(descripcion);
      if (m) { referencia = m[1]; descripcion = m[2].trim(); }
    }
    const key = `${referencia}|${descripcion}`;
    const ex = porProducto.get(key);
    if (ex) ex.cantidad += o.cantidadKg;
    else porProducto.set(key, { referencia, descripcion, cantidad: o.cantidadKg });
  }
  const filas = Array.from(porProducto.values()).sort((a, b) => a.referencia.localeCompare(b.referencia));
  const ruta = nombreRuta(vehiculo, ordenes);
  const logo = EMPRESAS.INVERSIONES.logo;

  return `<!doctype html><html><head><meta charset="utf-8">${baseHref()}<title>Consolidado ${esc(ruta)}</title><style>${CSS_BASE}
    .consol-h { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .consol-h img { height: 46px; width: auto; }
  </style></head>
  <body onload="setTimeout(function(){window.focus();window.print();},350)">
    <div class="page">
      <div class="consol-h"><img src="${logo}" alt=""/><div><h1>Formato consolidado de Despacho ruta: ${esc(ruta)}</h1><h2>Fecha: ${fechaConsolidado(ordenes)}</h2></div></div>
      <table>
        <thead><tr><th style="width:90px">Referencia</th><th>Descripción</th><th style="width:90px">Cantidad</th></tr></thead>
        <tbody>
          ${filas.map((f) => `<tr><td>${esc(f.referencia || "—")}</td><td>${esc(f.descripcion)}</td><td style="text-align:right">${fmtInt(f.cantidad)}</td></tr>`).join("")}
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
  const logo = EMPRESAS.AGROPECUARIA.logo;

  return `<!doctype html><html><head><meta charset="utf-8">${baseHref()}<title>Consolidado TAT ${esc(ruta)}</title><style>${CSS_BASE}
    .env { width: 26px; text-align: center; }
    .env.ng { background: #d9d9d9; }
    .num { width: 24px; text-align: center; }
    .cabecera { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; gap: 12px; }
    .cab-izq { display: flex; align-items: center; gap: 10px; font-size: 11px; line-height: 1.6; }
    .cab-izq img { height: 44px; width: auto; }
    .cab-der { width: 240px; border-collapse: collapse; }
    .cab-der td { border: 1px solid #333; padding: 3px 6px; font-size: 11px; }
    .cab-der .lbl { font-weight: bold; width: 70px; background: #f4f6f3; }
    .cab-der .val { font-weight: bold; font-size: 13px; }
  </style></head>
  <body onload="setTimeout(function(){window.focus();window.print();},350)">
    <div class="page">
      <div class="cabecera">
        <div class="cab-izq"><img src="${logo}" alt=""/><div><div><b>CONDUCTOR:</b> ${esc(vehiculo.conductor ?? "")}</div><div><b>AUXILIAR:</b></div></div></div>
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

// CSS compartido por las 2 plantillas de factura Siesa (Agropecuaria/Inversiones).
const CSS_FACTURA = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #000; margin: 0; padding: 18px; }
  table { border-collapse: collapse; width: 100%; }
  .page { page-break-after: always; padding-bottom: 4px; }
  .page:last-child { page-break-after: auto; }
  @media print { body { padding: 8px; } }
  .chico { font-size: 9.5px; color: #333; }
  .letras { margin: 5px 0; font-size: 10px; }
  .pie-firmas { margin-top: 14px; }
  .pie-firmas td { border: none; text-align: center; font-size: 9.5px; padding-top: 14px; }
  .pie-firmas .linea { border-top: 1px solid #000; padding-top: 3px; }
  .cufe-box { margin-top: 6px; font-size: 9px; word-break: break-all; }
  .footer-nota { margin-top: 10px; font-size: 8.5px; color: #333; line-height: 1.4; }
  .footer-marca { text-align: center; font-weight: bold; color: #2f8f4e; font-size: 11px; margin: 6px 0; }
`;

// ── Plantilla exacta AGROPECUARIA SANTACRUZ LIMITADA (calcada de la factura
// real FEP65016: logo circular verde, encabezado sin bordes, tabla
// CODIGO/DESCRIPCION/UM/CANT/COSTO UND/Descuento/%Dcto/IVA/COSTO TOTAL) ─────
function paginaAgropecuaria(numeroOrden: string, lineas: Orden[], vehiculo: VehiculoExterno): string {
  const primera = lineas[0];
  const empresa = EMPRESAS.AGROPECUARIA;
  const totalKg = lineas.reduce((s, l) => s + l.cantidadKg, 0);
  const totalValor = lineas.reduce((s, l) => s + l.valor, 0);
  const vcto = primera.fecha ? sumarDiasDMY(primera.fecha, 1) : "—";
  const verificada = Boolean(primera.cufe && primera.qrTexto);

  const filas = lineas.map((l) => {
    const referencia = l.productoCodigo ?? (/^(\d{2,})\s*[-–]?\s*/.exec(l.producto.trim())?.[1] ?? "—");
    const descripcion = l.producto.replace(/^\d{2,}\s*[-–]?\s*/, "");
    const precioUnit = l.cantidadKg > 0 ? l.valor / l.cantidadKg : 0;
    return `<tr>
      <td>${esc(referencia)}</td>
      <td>${esc(descripcion)}</td>
      <td style="text-align:center">KG</td>
      <td style="text-align:right">${fmtMoney(l.cantidadKg)}</td>
      <td style="text-align:right">$${fmtMoney(precioUnit)}</td>
      <td style="text-align:right">$0.00</td>
      <td style="text-align:center">0 %</td>
      <td style="text-align:center">0 %</td>
      <td style="text-align:right">$${fmtMoney(l.valor)}</td>
    </tr>`;
  }).join("");

  return `<div class="page">
    <table class="agro-header">
      <tr>
        <td style="border:none;width:58%;vertical-align:top">
          <img src="${empresa.logo}" class="agro-logo" alt=""/>
          <div class="agro-empresa">${esc(empresa.nombre)}</div>
          <div class="chico">${esc(empresa.direccion)}${empresa.ciudad ? " " + esc(empresa.ciudad) : ""}</div>
          <div class="chico">NIT: ${esc(empresa.nit)}</div>
          <div class="chico">Tel: ${esc(empresa.telefono)}</div>
          <div class="chico" style="margin-top:4px">Autorización Numeración de Facturación — Responsables del impuesto sobre las ventas IVA</div>
        </td>
        <td style="border:none;width:42%;text-align:right;vertical-align:top">
          ${verificada
            ? `<div>${qrSvg(primera.qrTexto!)}</div>`
            : `<div class="chico" style="color:#a33">Sin CUFE/QR — no hay factura Siesa asociada</div>`}
          <div class="agro-titulo">FACTURA ELECTRONICA<br/>DE VENTA</div>
          <table class="agro-campos">
            <tr><td class="lbl">Factura de Venta:</td><td>${esc(numeroOrden)}</td></tr>
            <tr><td class="lbl">Fecha de emisión:</td><td>${esc(primera.fecha ? dmyToYmdSlash(primera.fecha) : "—")}</td></tr>
            <tr><td class="lbl">Fecha de vencimiento:</td><td>${esc(vcto)}</td></tr>
            <tr><td class="lbl">Pedido:</td><td>${esc(primera.codigo ?? "—")}</td></tr>
          </table>
        </td>
      </tr>
    </table>
    <table class="agro-info">
      <tr><td class="lbl">NOMBRE CLIENTE:</td><td colspan="3"><b>${esc(primera.cliente.toUpperCase())}</b></td></tr>
      <tr>
        <td class="lbl">NIT:</td><td>${esc(primera.nit ?? "—")}</td>
        <td class="lbl">FORMA DE PAGO:</td><td>CONTADO</td>
      </tr>
      <tr>
        <td class="lbl">DIRECCION:</td><td>${esc(primera.direccion ?? "—")}</td>
        <td class="lbl">MEDIO DE PAGO:</td><td>CONTADO</td>
      </tr>
      <tr>
        <td class="lbl">CIUDAD:</td><td>${esc(tc(primera.destino))}</td>
        <td class="lbl">VENDEDOR:</td><td>${esc(primera.vendedor ?? "—")}</td>
      </tr>
      <tr>
        <td class="lbl">TELEFONO:</td><td>—</td>
        <td class="lbl">TRANSPORTADOR:</td><td>${esc(vehiculo.conductor ?? "—")} · ${esc(vehiculo.placa)}</td>
      </tr>
      <tr>
        <td class="lbl">CORREO:</td><td>—</td>
        <td class="lbl">No. REMISIÓN:</td><td>${esc(numeroOrden)}</td>
      </tr>
    </table>
    <table class="agro-tabla">
      <thead>
        <tr><th>CODIGO</th><th>DESCRIPCION</th><th style="width:32px">UM</th><th style="width:60px">CANT</th><th style="width:70px">COSTO UND</th><th style="width:70px">Descuento</th><th style="width:44px">% Dcto</th><th style="width:44px">IVA</th><th style="width:85px">COSTO TOTAL</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <table class="agro-totales">
      <tr><td class="lbl">VALOR BRUTO</td><td>$${fmtMoney(totalValor)}</td></tr>
      <tr><td class="lbl">DESCUENTO</td><td>$0.00</td></tr>
      <tr><td class="lbl">SUBTOTAL</td><td>$${fmtMoney(totalValor)}</td></tr>
      <tr><td class="lbl">IVA</td><td>$0.00</td></tr>
      <tr><td class="lbl">RETENCIONES</td><td>$0.00</td></tr>
      <tr><td class="lbl">TOTAL A PAGAR</td><td><b>$${fmtMoney(totalValor)}</b></td></tr>
    </table>
    <p class="chico">Notas: PEDIDO ${esc(primera.codigo ?? numeroOrden)}</p>
    <p class="letras"><b>VALOR EN LETRAS:</b> ${esc(valorEnLetras(totalValor))} *******</p>
    <table class="pie-firmas">
      <tr>
        <td class="linea">Elaborado Por:</td>
        <td class="linea">Recibo de la Factura</td>
        <td class="linea">Aprobado Por:</td>
      </tr>
    </table>
    <div class="cufe-box"><b>CUFE:</b> ${verificada ? esc(primera.cufe) : "No disponible en esta remisión"}</div>
    <div class="cufe-box"><b>FIRMA DIGITAL:</b> ${primera.firmaDigital ? esc(primera.firmaDigital) : "no disponible en esta remisión"}</div>
    <div class="footer-nota">
      Su opinión es importante para nosotros.<br/>
      Para peticiones, quejas, reclamos o felicitaciones, comuníquese con la Línea de Atención al Cliente al 316 435 4391 o con el Call Center a los números 323 619 5727 – 300 341 8833. Estamos para servirle!<br/><br/>
      Notificación de Pagos: Agradecemos enviar el soporte de sus pagos o transferencias indicando NIT/ Nombre del Cliente / Número de factura, al correo: cartera@frigorificosantacruz.com y/o al WhatsApp: +57 3102257491.
    </div>
    <div class="footer-marca">TRANSFORMAMOS VIDA</div>
    <div class="footer-nota" style="text-align:center">Factura generada por software SIESA de SISTEMAS DE INFORMACION EMPRESARIAL SAS. Nit 890.319.193-3. Siesa e-Invoicing Nit 890.319.193-3.</div>
    <p class="nota" style="font-size:8px;color:#888;margin-top:8px">Documento de despacho interno generado por SigRoute a partir de la remisión ${esc(numeroOrden)}${verificada ? " (CUFE, QR y firma digital verificados directo con Siesa)" : ""} — no reemplaza la factura electrónica oficial certificada por Siesa/DIAN.</p>
  </div>`;
}

// ── Plantilla exacta INVERSIONES SERRANO MILLAN S.A.S (calcada de la
// factura real FESI25347: logo Carnes Frías, grilla de encabezado con
// bordes, tabla Nro/REF/DESCRIPCION/LOTE/CANTIDAD/U.M./PRECIO UNIT/DSCTO/
// IPCU/IVA%/VALOR TOTAL, sección de totales+impuestos idéntica) ───────────
function paginaInversiones(numeroOrden: string, lineas: Orden[], vehiculo: VehiculoExterno): string {
  const primera = lineas[0];
  const empresa = EMPRESAS.INVERSIONES;
  const totalKg = lineas.reduce((s, l) => s + l.cantidadKg, 0);
  const totalValor = lineas.reduce((s, l) => s + l.valor, 0);
  const vcto = primera.fecha ? sumarDiasDMY(primera.fecha, 1) : "—";
  const verificada = Boolean(primera.cufe && primera.qrTexto);
  const iva = Math.round(totalValor * 0.05 * 100) / 100; // 5% IVA, misma tasa vista en la factura real
  const subtotal = totalValor + iva;

  const filas = lineas.map((l, i) => {
    const referencia = l.productoCodigo ?? (/^(\d{2,})\s*[-–]?\s*/.exec(l.producto.trim())?.[1] ?? "—");
    const descripcion = l.producto.replace(/^\d{2,}\s*[-–]?\s*/, "");
    const precioUnit = l.cantidadKg > 0 ? l.valor / l.cantidadKg : 0;
    return `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${esc(referencia)}</td>
      <td>${esc(descripcion)}</td>
      <td>—</td>
      <td style="text-align:right">${fmtMoney(l.cantidadKg)}</td>
      <td style="text-align:center">KG</td>
      <td style="text-align:right">$${fmtMoney(precioUnit)}</td>
      <td style="text-align:right">0.00 %</td>
      <td style="text-align:right">0.00 %</td>
      <td style="text-align:center">5 %</td>
      <td style="text-align:right">$${fmtMoney(l.valor)}</td>
    </tr>`;
  }).join("");

  return `<div class="page">
    <table class="inv-header">
      <tr>
        <td style="border:none;width:55%;vertical-align:top">
          <table style="border:none"><tr>
            <td style="border:none;width:70px;vertical-align:top"><img src="${empresa.logo}" class="inv-logo" alt=""/></td>
            <td style="border:none;vertical-align:top">
              <div class="inv-empresa">${esc(empresa.nombre)}</div>
              <div class="chico">NIT. ${esc(empresa.nit)}</div>
              <div class="chico">${esc(empresa.direccion)}</div>
              <div class="chico">☎ ${esc(empresa.telefono)}</div>
              <div class="chico">${esc(empresa.ciudad)}</div>
              <div class="chico">✉ ${esc(empresa.email)}</div>
            </td>
          </tr></table>
        </td>
        <td style="border:none;width:45%;text-align:right;vertical-align:top">
          ${verificada
            ? `<div>${qrSvg(primera.qrTexto!)}</div>`
            : `<div class="chico" style="color:#a33">Sin CUFE/QR — no hay factura Siesa asociada</div>`}
          <div class="inv-titulo">FACTURA ELETRONICA</div>
          <div class="inv-numero">${esc(numeroOrden)}</div>
          <div class="chico">Página: 1 de 1</div>
        </td>
      </tr>
    </table>
    <table class="inv-info">
      <tr>
        <td class="lbl">Señor (es):</td><td>${esc(primera.cliente.toUpperCase())}</td>
        <td class="lbl">Forma de Pago:</td><td>CONTADO</td>
        <td class="lbl" rowspan="2">Vendedor:</td><td rowspan="2">${esc(primera.vendedor ?? "—")}</td>
      </tr>
      <tr>
        <td class="lbl">Contacto:</td><td>${esc(primera.cliente.toUpperCase())}</td>
        <td class="lbl">Medio de Pago:</td><td>CONTADO</td>
      </tr>
      <tr>
        <td class="lbl">Nit o C.C.:</td><td>${esc(primera.nit ?? "—")}</td>
        <td class="lbl">Fecha Factura:</td><td>${esc(primera.fecha ? dmyToYmdSlash(primera.fecha) : "—")}</td>
        <td class="lbl">Fecha de Vcto:</td><td>${esc(vcto)}</td>
      </tr>
      <tr>
        <td class="lbl">Dirección:</td><td>${esc(primera.direccion ?? "—")}</td>
        <td class="lbl">Orden de Compra</td><td>${esc(primera.codigo ?? "—")}</td>
        <td class="lbl">Transportador:</td><td>${esc(vehiculo.conductor ?? "—")}</td>
      </tr>
      <tr>
        <td class="lbl">Ciudad:</td><td>${esc(tc(primera.destino))}</td>
        <td class="lbl">No. Remisión:</td><td>${esc(numeroOrden)}</td>
        <td class="lbl">Carque:</td><td>${esc(vehiculo.placa)}</td>
      </tr>
      <tr>
        <td class="lbl">Barrio:</td><td>—</td>
        <td class="lbl">Nro. Pedido</td><td>${esc(primera.codigo ?? numeroOrden)}</td>
        <td class="lbl">Teléfono:</td><td>—</td>
      </tr>
    </table>
    <div class="chico" style="margin:4px 0"><b>CUFE:</b> ${verificada ? esc(primera.cufe) : "No disponible en esta remisión"}</div>
    <table class="inv-tabla">
      <thead>
        <tr><th style="width:24px">Nro</th><th style="width:44px">REF</th><th>DESCRIPCION</th><th style="width:50px">LOTE</th><th style="width:56px">CANTIDAD</th><th style="width:32px">U.M.</th><th style="width:70px">PRECIO UNIT</th><th style="width:40px">DSCTO</th><th style="width:40px">IPCU</th><th style="width:34px">IVA %</th><th style="width:85px">VALOR TOTAL</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <table class="inv-totales">
      <tr><td class="lbl">Total Cantidad</td><td>${fmtInt(totalKg)}</td>
        <td class="lbl">TOTAL BRUTO</td><td>$${fmtMoney(totalValor)}</td>
        <td class="lbl">DSCTO X LINEA</td><td>$0.00</td></tr>
      <tr><td class="lbl">IMPUESTOS</td><td>$${fmtMoney(iva)}</td>
        <td class="lbl">SUB-TOTAL</td><td>$${fmtMoney(subtotal)}</td>
        <td class="lbl">RETENCIONES</td><td>$0.00</td></tr>
      <tr><td class="lbl" colspan="4">TOTAL</td><td colspan="2"><b>$${fmtMoney(subtotal)}</b></td></tr>
    </table>
    <table class="inv-impuestos">
      <thead><tr><th></th><th>DESCRIPCIÓN IMPUESTO</th><th>BASE</th><th>TASA</th><th>TOTAL IMPUESTO</th></tr></thead>
      <tbody><tr><td>IVA</td><td></td><td style="text-align:right">$${fmtMoney(totalValor)}</td><td style="text-align:center">5 %</td><td style="text-align:right">$${fmtMoney(iva)}</td></tr></tbody>
    </table>
    <p class="letras"><b>Valor Letras:</b> ${esc(valorEnLetras(subtotal))} *******</p>
    <p class="chico">OBSERVACIONES: —</p>
    <p class="chico">Autorización Numeración de Facturación — Vigencia de la resolución DIAN vigente.</p>
    <table class="pie-firmas">
      <tr><td>Para Pagos y Transferencias, Escanee el código QR:</td><td style="text-align:right">${verificada ? qrSvg(primera.qrTexto!, 72) : ""}</td></tr>
    </table>
    <div class="cufe-box"><b>Firma Digital Electrónica:</b> ${primera.firmaDigital ? esc(primera.firmaDigital) : "no disponible en esta remisión"}</div>
    <div class="footer-nota" style="text-align:center;margin-top:8px">Factura generada por Software de Sistemas de información empresarial s.a.s NIT 890.319.193-3 PST Siesa e-Invoicing</div>
    <p class="nota" style="font-size:8px;color:#888;margin-top:8px">Documento de despacho interno generado por SigRoute a partir de la remisión ${esc(numeroOrden)}${verificada ? " (CUFE, QR y firma digital verificados directo con Siesa)" : ""} — no reemplaza la factura electrónica oficial certificada por Siesa/DIAN.</p>
  </div>`;
}

// ── Remisiones individuales de la ruta: cada factura se imprime con la
// plantilla EXACTA de su propia razón social (AGROPECUARIA o INVERSIONES,
// según empresaDe()) — antes usaban una única plantilla híbrida para ambas.
// Una página por remisión (numeroOrden), con salto de página entre ellas.
export function docRemisionesRuta(vehiculo: VehiculoExterno, ordenes: Orden[]): string {
  const porRemision = new Map<string, Orden[]>();
  for (const o of ordenes) {
    const arr = porRemision.get(o.numeroOrden) ?? [];
    arr.push(o);
    porRemision.set(o.numeroOrden, arr);
  }

  const paginas = Array.from(porRemision.entries()).map(([numeroOrden, lineas]) => {
    const empresa = empresaDe(lineas[0]);
    return empresa === EMPRESAS.INVERSIONES
      ? paginaInversiones(numeroOrden, lineas, vehiculo)
      : paginaAgropecuaria(numeroOrden, lineas, vehiculo);
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8">${baseHref()}<title>Remisiones ${esc(vehiculo.placa)}</title><style>${CSS_FACTURA}
    .agro-header td, .agro-info td { border: none; padding: 1px 4px; }
    .agro-logo { height: 70px; width: auto; margin-bottom: 2px; }
    .agro-empresa { font-size: 12.5px; font-weight: bold; }
    .agro-titulo { font-size: 11px; font-weight: bold; text-align: right; margin: 4px 0; }
    .agro-campos { margin-left: auto; }
    .agro-campos td { border: none; padding: 1px 4px; font-size: 9.5px; }
    .agro-campos .lbl { font-weight: bold; text-align: right; }
    .agro-info { margin: 8px 0; }
    .agro-info .lbl { font-weight: bold; width: 95px; }
    .agro-tabla th, .agro-tabla td { border: 1px solid #333; padding: 3px 5px; font-size: 9.5px; }
    .agro-totales { width: 260px; margin-left: auto; margin-top: 6px; }
    .agro-totales td { border: 1px solid #333; padding: 2px 6px; font-size: 9.5px; }
    .agro-totales .lbl { font-weight: bold; background: #f4f6f3; }

    .inv-header td { border: none; padding: 1px 4px; }
    .inv-logo { height: 60px; width: auto; }
    .inv-empresa { font-size: 12px; font-weight: bold; }
    .inv-titulo { font-size: 11px; font-weight: bold; }
    .inv-numero { font-weight: bold; border: 1px solid #333; display: inline-block; padding: 1px 8px; margin: 2px 0; }
    .inv-info { margin: 6px 0; }
    .inv-info td { border: 1px solid #333; padding: 2px 5px; font-size: 9px; }
    .inv-info .lbl { font-weight: bold; background: #f4f6f3; }
    .inv-tabla th, .inv-tabla td { border: 1px solid #333; padding: 3px 4px; font-size: 9px; }
    .inv-totales { margin-top: 6px; }
    .inv-totales td { border: 1px solid #333; padding: 2px 6px; font-size: 9.5px; }
    .inv-totales .lbl { font-weight: bold; background: #f4f6f3; }
    .inv-impuestos { margin-top: 4px; width: 60%; }
    .inv-impuestos th, .inv-impuestos td { border: 1px solid #333; padding: 2px 5px; font-size: 9px; }
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
