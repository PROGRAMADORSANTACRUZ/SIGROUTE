"""Genera la documentacion tecnica breve de integracion SIGROUTE -> software
externo de control de carga (.docx). Script de un solo uso: correr y borrar
si ya no se necesita regenerar el documento."""
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

VERDE = RGBColor(0x14, 0x35, 0x2A)
VERDE_ACENTO = RGBColor(0x2F, 0x8F, 0x4E)
GRIS = RGBColor(0x5F, 0x7A, 0x68)
GRIS_CLARO = RGBColor(0x9A, 0xA4, 0xAF)
NEGRO_TEXTO = RGBColor(0x2A, 0x2E, 0x2B)

doc = Document()
doc.core_properties.title = "SIGROUTE — Documentacion tecnica de integracion"
doc.core_properties.subject = "Envio de informacion de planificacion y ejecucion a software externo de control de carga"
doc.core_properties.author = "Grupo Santacruz — SIGROUTE"

normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10.5)
normal.font.color.rgb = NEGRO_TEXTO

for sec in doc.sections:
    sec.left_margin = Cm(2.4)
    sec.right_margin = Cm(2.4)
    sec.top_margin = Cm(2.0)
    sec.bottom_margin = Cm(2.0)


def set_cell_shading(cell, color_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color_hex)
    tcPr.append(shd)


def set_cell_borders(cell, color="D9DEDA", size=4):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:color"), color)
        borders.append(el)
    tcPr.append(borders)


def bottom_rule(paragraph, color="14352A", size=10):
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    pBdr.append(bottom)
    pPr.append(pBdr)


def add_page_number_field(paragraph):
    run = paragraph.add_run()
    fld1 = OxmlElement("w:fldChar"); fld1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve"); instr.text = "PAGE"
    fld2 = OxmlElement("w:fldChar"); fld2.set(qn("w:fldCharType"), "end")
    run._r.append(fld1); run._r.append(instr); run._r.append(fld2)


# ───────────────────────── Encabezado / pie de pagina (todas las paginas) ─
header = doc.sections[0].header
hp = header.paragraphs[0]
hp.text = ""
hr = hp.add_run("SIGROUTE")
hr.font.size = Pt(9)
hr.bold = True
hr.font.color.rgb = VERDE
hr2 = hp.add_run("  ·  Grupo Santacruz")
hr2.font.size = Pt(9)
hr2.font.color.rgb = GRIS
hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
bottom_rule(hp, color="DFE4E0", size=6)

footer = doc.sections[0].footer
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fr = fp.add_run("Documento tecnico interno — pagina ")
fr.font.size = Pt(8)
fr.font.color.rgb = GRIS_CLARO
add_page_number_field(fp)
fp.runs[-1].font.size = Pt(8)
fp.runs[-1].font.color.rgb = GRIS_CLARO


def titulo(texto, tam=20, color=VERDE, espacio_antes=0, espacio_despues=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(espacio_antes)
    p.paragraph_format.space_after = Pt(espacio_despues)
    r = p.add_run(texto)
    r.bold = True
    r.font.size = Pt(tam)
    r.font.color.rgb = color
    return p


def subtitulo(numero, texto):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    rnum = p.add_run(f"{numero}  ")
    rnum.bold = True
    rnum.font.size = Pt(12.5)
    rnum.font.color.rgb = VERDE_ACENTO
    rtxt = p.add_run(texto)
    rtxt.bold = True
    rtxt.font.size = Pt(12.5)
    rtxt.font.color.rgb = VERDE
    bottom_rule(p, color="DFE4E0", size=6)
    return p


def parrafo(texto, color=None, tam=10.5, bold=False, italic=False, space_after=8):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.18
    r = p.add_run(texto)
    r.font.size = Pt(tam)
    r.bold = bold
    r.italic = italic
    if color:
        r.font.color.rgb = color
    return p


def bullet(texto, negrita=None):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.12
    if negrita:
        r = p.add_run(negrita)
        r.bold = True
        r.font.size = Pt(10.5)
        r.font.color.rgb = VERDE
        p.add_run(texto)
    else:
        p.add_run(texto)
    for run in p.runs:
        if run.font.size is None:
            run.font.size = Pt(10.5)
    return p


def tabla_campos(filas, encabezados=("Campo", "Descripcion")):
    t = doc.add_table(rows=1, cols=2)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = True
    t.columns[0].width = Cm(5.0)
    t.columns[1].width = Cm(10.5)
    hdr = t.rows[0].cells
    for i, h in enumerate(encabezados):
        hdr[i].text = h
        set_cell_shading(hdr[i], "14352A")
        set_cell_borders(hdr[i])
        hdr[i].paragraphs[0].paragraph_format.space_before = Pt(3)
        hdr[i].paragraphs[0].paragraph_format.space_after = Pt(3)
        for p in hdr[i].paragraphs:
            for r in p.runs:
                r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                r.font.bold = True
                r.font.size = Pt(10)
    for idx, (campo, desc) in enumerate(filas):
        row = t.add_row().cells
        row[0].text = campo
        row[1].text = desc
        fondo = "F7FAF5" if idx % 2 == 0 else "FFFFFF"
        for c in row:
            set_cell_shading(c, fondo)
            set_cell_borders(c)
            c.paragraphs[0].paragraph_format.space_before = Pt(2)
            c.paragraphs[0].paragraph_format.space_after = Pt(2)
            for p in c.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(9.5)
        row[0].paragraphs[0].runs[0].bold = True
        row[0].paragraphs[0].runs[0].font.color.rgb = VERDE
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


# ───────────────────────── Portada ─────────────────────────
doc.add_paragraph().paragraph_format.space_after = Pt(30)
titulo("SIGROUTE", tam=30, espacio_despues=2)
titulo("Documentacion tecnica de integracion", tam=15, color=GRIS, espacio_despues=4)
p = doc.add_paragraph()
r = p.add_run("Envio de informacion de planificacion y ejecucion de distribucion a software externo de control de carga")
r.font.size = Pt(11)
r.font.color.rgb = VERDE_ACENTO
r.italic = True
p.paragraph_format.space_after = Pt(4)
bottom_rule(p, color="2F8F4E", size=14)

p2 = doc.add_paragraph()
p2.paragraph_format.space_before = Pt(10)
p2.paragraph_format.space_after = Pt(26)
r2 = p2.add_run("Grupo Santacruz  ·  Planeacion y Ejecucion de Distribucion  ·  Octubre 2026")
r2.font.size = Pt(9.5)
r2.font.color.rgb = GRIS_CLARO

# ───────────────────────── 1. Proposito ─────────────────────────
subtitulo("1.", "Proposito")
parrafo(
    "Este documento resume, de forma breve, que informacion de SIGROUTE — el sistema de "
    "planeacion y ejecucion logistica de Grupo Santacruz — puede remitirse a su software, "
    "encargado de declarar ante la Superintendencia de Transporte las rutas y cargas "
    "transportadas (manifiestos de carga: vehiculo, conductor, recorrido y kilos "
    "transportados). El objetivo es dejar claro que datos existen hoy en SIGROUTE, en que "
    "momento del proceso estan disponibles, y que SIGROUTE ya ensambla internamente las "
    "rutas (vehiculo, conductor y destinos con su carga) que normalmente hay que declarar "
    "ante este tipo de software."
)

# ───────────────────────── 2. Resumen del sistema ─────────────────────────
subtitulo("2.", "Dos dominios de informacion en SIGROUTE")
parrafo(
    "SIGROUTE maneja dos tipos de informacion, generados en momentos distintos del dia "
    "operativo:"
)
bullet(
    " lo que se planea cargar ese dia por destino/cliente y categoria de producto, "
    "las rutas armadas (vehiculo, conductor, destinos en orden) y el cierre de cada area "
    "de cargue. Se define antes del despacho.",
    negrita="Planificacion — ",
)
bullet(
    " las ordenes y facturas que realmente se despacharon, el vehiculo que las "
    "transporto y el envio real al operador de distribucion. Se genera durante y despues "
    "del despacho, con datos reales de lo que salio de planta.",
    negrita="Ejecucion — ",
)
parrafo(
    "Para efectos de la declaracion ante su software, lo relevante es la Ejecucion — el "
    "viaje realmente transportado — mientras que la Planificacion sirve como respaldo de "
    "consistencia (comparar lo planeado contra lo ejecutado), pero no reemplaza el dato real."
)

# ───────────────────────── 3. Datos de Planificacion ─────────────────────────
subtitulo("3.", "Informacion de Planificacion disponible")
parrafo("Por cada dia operativo, SIGROUTE tiene registrado:")
tabla_campos([
    ("Fecha y consecutivo de programacion", "Dia operativo y numero de consecutivo de esa programacion."),
    ("Rutas del dia", "Numero de ruta, vehiculo (placa), conductor y auxiliares asignados."),
    ("Hora de cargue", "Hora prevista o registrada de cargue de cada ruta."),
    ("Destinos por ruta, en orden", "Cliente o destino de entrega, en la secuencia real de reparto."),
    ("Kilos y canastillas por categoria", "Bovino, Viscera Bovino, Porcino, Viscera Porcino, Inversion, TAT y Otros, por destino y total de la ruta."),
    ("Peso total de la ruta", "Suma de kilos de todos los destinos asignados a ese vehiculo."),
    ("Cierre de areas de cargue", "Estado — pendiente, en proceso o cargada — y hora de confirmacion de cada area involucrada."),
])

# ───────────────────────── 4. Datos de Ejecucion ─────────────────────────
subtitulo("4.", "Informacion de Ejecucion disponible")
parrafo(
    "Estos son los datos reales del despacho: nacen al cargar las facturas (desde la fuente "
    "contable o por archivo, segun la linea de negocio) y se confirman al asignar vehiculo y "
    "remitir al operador de distribucion:"
)
tabla_campos([
    ("Numero de orden o factura", "Identificador real de la factura o pedido despachado."),
    ("Cliente y destino", "Razon social, NIT y punto de entrega — direccion y ciudad real del cliente."),
    ("Producto y codigo", "Descripcion del producto y codigo interno, cuando la fuente lo entrega."),
    ("Cantidad (kg) y valor", "Kilos facturados y valor de la factura."),
    ("Vehiculo asignado (placa)", "Vehiculo que realmente transporto esa factura."),
    ("Ruta o tarifa", "Nombre de la ruta — por ejemplo Barranquilla o Cartagena — usada para el flete."),
    ("Fecha de despacho", "Fecha real de salida, que puede diferir de la fecha de la factura."),
    ("Linea de negocio", "Agropecuaria, TAT o Inversiones."),
    ("Factura electronica (CUFE)", "Codigo unico de facturacion electronica, cuando la factura lo trae."),
    ("Estado de la orden", "Asignada, Enviada, Entregada, Rechazada o Reenviada."),
    ("Evento de envio real a distribucion", "Fecha y hora del envio, placas y facturas incluidas, kilos totales y resultado — queda en un historico que nunca se borra."),
])

# ───────────────────────── 5. Rutas ya armadas ─────────────────────────
subtitulo("5.", "Las rutas quedan ensambladas dentro de SIGROUTE")
parrafo(
    "Cuando un vehiculo sale cargado, SIGROUTE ya tiene ensamblado — listo para consultar o "
    "exportar — exactamente lo que un manifiesto de carga necesita declarar:"
)
bullet("Vehiculo (placa) y conductor asignados a ese viaje.")
bullet("Lista ordenada de destinos o clientes que visita esa ruta.")
bullet("Peso total cargado, en kilos, con el detalle factura por factura que lo compone.")
bullet("Fecha de despacho y linea de negocio de la carga transportada.")
parrafo(
    "En otras palabras: no es necesario reconstruir la ruta desde cero para declararla — "
    "SIGROUTE ya la tiene montada como parte normal de su operacion diaria. Resta unicamente "
    "mapear estos campos al formato que su software requiera para recibir la informacion."
)

# ───────────────────────── 6. API de Planificacion ─────────────────────────
subtitulo("6.", "Consulta de Planificacion por API")
parrafo(
    "Su software consulta directamente la planificacion vigente de SIGROUTE mediante una peticion "
    "HTTP GET. La respuesta se lee de la base de datos en cada solicitud; no es un archivo ni una "
    "copia programada. Si no se indica fecha, consulta el dia actual en la zona horaria de Bogota."
)
parrafo("Endpoint completo para produccion:", bold=True, space_after=3)
parrafo(
    "https://sigroute.grupo-santacruz.com/api/integraciones/control-carga/planificacion?token="
    "4b714fd07f52eb7721d3febfd728f3d07e08f467e1379aa89a23f89e88120f02",
    color=VERDE_ACENTO, tam=9.5, space_after=8,
)
parrafo("Para consultar otra fecha, agregue el parametro fecha=YYYY-MM-DD:", space_after=3)
parrafo(
    "https://sigroute.grupo-santacruz.com/api/integraciones/control-carga/planificacion?token="
    "4b714fd07f52eb7721d3febfd728f3d07e08f467e1379aa89a23f89e88120f02&fecha=2026-10-08",
    color=VERDE_ACENTO, tam=9.5,
)
parrafo(
    "El ejemplo de fecha es ilustrativo; reemplacelo por el dia solicitado. La fecha es opcional "
    "y debe enviarse en formato YYYY-MM-DD.",
    color=GRIS, tam=9.5,
)
parrafo("Autenticacion y respuestas HTTP", bold=True, space_after=3)
tabla_campos([
    ("Token", "Es exclusivo de este endpoint. Debe conservarse como secreto y no compartirse en codigo fuente, repositorios publicos ni registros del cliente."),
    ("200", "Consulta correcta. Incluye la planificacion, rutas, vehiculos, destinos locales, categorias y valor del flete."),
    ("400", "La fecha no tiene el formato YYYY-MM-DD."),
    ("401", "Token ausente o no valido."),
    ("404", "No existe una planificacion para la fecha consultada."),
    ("503", "El token de integracion aun no esta configurado en el servidor."),
])
parrafo("Campos principales de la respuesta", bold=True, space_after=3)
tabla_campos([
    ("planificacion.fecha / consecutivo / estado", "Dia operativo, numero consecutivo y estado de la planificacion."),
    ("rutas[].placa / nombreRuta / numeroRuta", "Vehiculo asignado y nombre/consecutivo de ruta. placa es null si aun no se ha asignado vehiculo."),
    ("rutas[].conductor / horaCargue", "Conductor y hora de cargue registrados en Planificacion."),
    ("Rutas[].kilosTotales / valorFlete", "Kilos planificados agregados de la ruta y flete calculado segun la tarifa vigente. El flete es null si faltan ruta/capacidad o tarifa."),
    ("Destinos[].clienteId / cliente", "Identificador y nombre del cliente del maestro local SIGROUTE. cliente/destino pueden ser null si el identificador historico ya no existe en el maestro actual."),
    ("Destinos[].destino / direccion / ciudad", "Sucursal/destino, direccion y ciudad del maestro local; pueden ser null si no existe una referencia vigente."),
    ("destinos[].cargas[]", "Desglose por tipo: bovino, porcino, embutido, TAT u otros; incluye kilos programados, canastillas y kilos totales."),
    ("destinosSinRuta[]", "Clientes con carga planificada que todavia no han sido asignados a una ruta/vehiculo."),
    ("areas[]", "Estado de cierre y fecha/hora de cada area de cargue."),
])
parrafo(
    "La categoria de planificacion Inversiones se entrega como tipo embutido y conserva "
    "categoriaPlanificacion=inversiones para rastrear el nombre exacto guardado en SIGROUTE. "
    "Viscera Bovino y Viscera Porcino se identifican en categoriaPlanificacion y mantienen "
    "el tipo general bovino o porcino. Los kilos totales incluyen kilos programados mas "
    "canastillas convertidas con el factor configurado en SIGROUTE (1,9 kg por canastilla). "
    "El valorFlete aparece una sola vez por ruta, no se debe sumar una vez por destino. "
    "Los kilos se redondean a dos decimales. Si un cliente historico fue eliminado del maestro, "
    "SIGROUTE conserva su identificador planificado pero no inventa nombre/direccion; esos "
    "campos se devuelven como null.",
)
parrafo("Formato resumido de respuesta", bold=True, space_after=3)
parrafo(
    '{ "sistema": "SIGROUTE", "version": 1, "planificacion": { "fecha": "YYYY-MM-DD", '
    '"rutas": [{ "placa": "...", "valorFlete": 0, "destinos": [{ "cliente": "...", '
    '"destino": "...", "cargas": [{ "tipo": "bovino", "kilosTotales": 0 }] }] }], '
    '"destinosSinRuta": [] } }',
    tam=9, color=VERDE,
)

# ───────────────────────── 7. Configuracion del token ─────────────────────────
subtitulo("7.", "Configuracion y seguridad")
parrafo(
    "Antes de habilitar la consulta en produccion, registrar en las variables de entorno de "
    "Dokploy la clave PLANIFICACION_CONTROL_CARGA_TOKEN con exactamente este valor:",
)
parrafo(
    "4b714fd07f52eb7721d3febfd728f3d07e08f467e1379aa89a23f89e88120f02",
    color=VERDE_ACENTO, tam=10,
)
bullet("El token solo autoriza este GET y no concede acceso a otros endpoints ni permite modificar informacion.")
bullet("El receptor debe guardarlo en un gestor de secretos y limitar su distribucion a la persona/sistema autorizado.")
bullet("La respuesta no se cachea. Cada peticion refleja los datos guardados en SIGROUTE al momento de la consulta.")
bullet("El endpoint informa valorFlete=null cuando no hay ruta reconocida o capacidad del vehiculo; SIGROUTE no inventa un precio.")

# ───────────────────────── 8. Ejecucion y alcance ─────────────────────────
subtitulo("8.", "Ejecucion y alcance")
parrafo(
    "Esta primera integracion publica Planificacion: kilos por cliente/categoria, rutas, "
    "placas, destinos del maestro local y flete. No equivale a confirmar que la carga salio "
    "ni reemplaza los datos reales de Ejecucion descritos anteriormente."
)
parrafo(
    "Si el software necesita despues un manifiesto de carga real —por ejemplo conductor/documento, "
    "peso efectivamente despachado o marca de salida— se debe acordar esa ampliacion y su momento "
    "de confirmacion; esos valores no se deben interpretar como planificados."
)

doc.save(r"c:\Users\molin\OneDrive\Desktop\SANTA CRUZ PROJECTS\suite-santacruz\SIGROUTE\docs\SIGROUTE_Integracion_Control_de_Carga.docx")
print("OK")
