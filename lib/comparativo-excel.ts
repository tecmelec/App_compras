import ExcelJS from 'exceljs';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LineaPresupuesto, ProveedorPresupuesto } from '@/lib/presupuesto';
import { referenciaEnDescripcion } from '@/lib/referencia-proveedor';

// Comparativo de ofertas en Excel (misma estructura que la plantilla
// BASE_COMPARATIVO_MATERIALES_v2): una columna por oferta (las versiones anteriores de un
// mismo proveedor quedan como histórico, "NO" vigentes), condiciones de Administración →
// Condiciones comerciales (pronto pago y rappel), todo con fórmulas.

const AZUL = 'FF0000FF';
const GRIS = 'FF595959';
const F_CAB: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E3D' } };
const F_SUB: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const F_IN: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
};
const EUR = '#,##0.00 €;-#,##0.00 €;"-"';
const EUR4 = '#,##0.0000 €;-#,##0.0000 €;"-"';
const PCT = '0.0%;-0.0%;"-"';
const fuente = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 10, ...o });

function L(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const normalizar = (s: string | null | undefined) => (s || '').replace(/[\s.\-_/]/g, '').toUpperCase();

export type Oferta = {
  nombre: string;
  nota: string;
  vigente: boolean;
  pp: number;
  rappel: number;
  precios: (number | null)[]; // por línea
};

export async function generarComparativoExcel(pedidoId: string): Promise<{ buffer: Buffer; nombre: string } | { error: string }> {
  const admin = createAdminClient();
  const { data: pedido } = await admin
    .from('pedidos')
    .select('numero_app, proyectos(bc_job_no, descripcion), pedido_items(id, cantidad, rechazada_por_aprobador, productos(nombre, bc_item_no, unidad_medida))')
    .eq('id', pedidoId)
    .single();
  if (!pedido) return { error: 'Solicitud no encontrada.' };
  const p: any = pedido;
  const items = (p.pedido_items || []).filter((i: any) => !i.rechazada_por_aprobador && Number(i.cantidad) > 0);
  if (items.length === 0) return { error: 'La solicitud no tiene líneas.' };

  const { data: presupuestos } = await admin
    .from('presupuestos')
    .select('id, proveedor, lineas, asignaciones, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true });
  if (!presupuestos || presupuestos.length === 0) {
    return { error: 'No hay ofertas en esta solicitud: analiza primero las ofertas con "Asignar precios desde presupuesto" o "Usar como presupuesto".' };
  }

  const idsProv = Array.from(new Set(presupuestos.map((x: any) => (x.proveedor || {}).proveedor_id).filter(Boolean)));
  const [{ data: provs }, { data: conds }] = await Promise.all([
    idsProv.length ? admin.from('proveedores').select('id, bc_proveedor_no, nombre').in('id', idsProv) : Promise.resolve({ data: [] as any[] }),
    idsProv.length
      ? admin.from('condiciones_proveedor').select('proveedor_id, pronto_pago_pct, rappel_pct').in('proveedor_id', idsProv)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const provPorId = new Map((provs || []).map((x: any) => [x.id, x]));
  const condPorId = new Map((conds || []).map((x: any) => [x.proveedor_id, x]));

  // Una columna por presupuesto; las versiones de un mismo proveedor se numeran (V2, V3…)
  // y solo la última queda vigente.
  const porProveedor = new Map<string, any[]>();
  for (const pr of presupuestos as any[]) {
    const prov = (pr.proveedor || {}) as ProveedorPresupuesto;
    const k = prov.proveedor_id || prov.bc_no || prov.nombre || pr.id;
    porProveedor.set(k, [...(porProveedor.get(k) || []), pr]);
  }
  const ofertas: Oferta[] = [];
  porProveedor.forEach((lista) => {
    lista.forEach((pr: any, v: number) => {
      const prov = (pr.proveedor || {}) as ProveedorPresupuesto;
      const ficha = prov.proveedor_id ? provPorId.get(prov.proveedor_id) : null;
      const base = ficha ? `${ficha.bc_proveedor_no} ${ficha.nombre || ''}`.trim() : prov.bc_nombre || prov.nombre || 'Proveedor';
      const cond = prov.proveedor_id ? condPorId.get(prov.proveedor_id) : null;
      const lineasP = (pr.lineas || []) as LineaPresupuesto[];
      const asign = (pr.asignaciones || []) as { item_id: string; linea_idx: number }[];
      ofertas.push({
        nombre: lista.length > 1 && v > 0 ? `${base} V${v + 1}` : base,
        nota: `Oferta del ${new Date(pr.created_at).toLocaleDateString('es-ES')}${cond ? '' : ' · sin condiciones'}`,
        vigente: v === lista.length - 1,
        pp: cond ? Number(cond.pronto_pago_pct) / 100 : 0,
        rappel: cond ? Number(cond.rappel_pct) / 100 : 0,
        precios: items.map((it: any) => {
          const a = asign.find((x) => x.item_id === it.id);
          let l = a ? lineasP.find((x) => x.idx === a.linea_idx) : undefined;
          const bc = normalizar(it.productos?.bc_item_no);
          if (!l && bc) l = lineasP.find((x) => normalizar(x.referencia) === bc);
          if (!l) l = lineasP.find((x) => referenciaEnDescripcion(x.referencia, it.productos?.nombre));
          return l && l.precio_unitario != null ? Number(l.precio_unitario) : null;
        }),
      });
    });
  });

  const proyectoTxt = p.proyectos ? `${p.proyectos.bc_job_no} — ${p.proyectos.descripcion || ''}` : '';
  const buffer = await construirComparativo({
    numeroApp: p.numero_app,
    proyecto: proyectoTxt,
    items: items.map((it: any) => ({
      codigo: it.productos?.bc_item_no || '',
      descripcion: it.productos?.nombre || '',
      unidad: it.productos?.unidad_medida || '',
      cantidad: Number(it.cantidad),
    })),
    ofertas,
  });
  return { buffer, nombre: `Comparativo_${p.numero_app}.xlsx` };
}

export type DatosComparativo = {
  numeroApp: string;
  proyecto: string;
  items: { codigo: string; descripcion: string; unidad: string; cantidad: number }[];
  ofertas: Oferta[];
};

// Construye el libro (separado de la carga de datos para poder probarlo).
export async function construirComparativo(d: DatosComparativo): Promise<Buffer> {
  const { items, ofertas } = d;
  const p = { numero_app: d.numeroApp };
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const res = wb.addWorksheet('Resumen');
  const ws = wb.addWorksheet('Comparativo');
  const N = ofertas.length;
  const first = 8;
  const cols = (i: number) => [L(first + 3 * i), L(first + 3 * i + 1), L(first + 3 * i + 2)];
  const cMejor = L(first + 3 * N);
  const cProv = L(first + 3 * N + 1);
  const cTot = L(first + 3 * N + 2);
  const cRef = L(first + 3 * N + 3);
  const ULT = first + 3 * N + 3;
  const set = (h: ExcelJS.Worksheet, ref: string, v: any, o: { font?: Partial<ExcelJS.Font>; fill?: ExcelJS.Fill; fmt?: string; align?: Partial<ExcelJS.Alignment>; borde?: boolean } = {}) => {
    const c = h.getCell(ref);
    c.value = typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : v;
    c.font = fuente(o.font);
    if (o.fill) c.fill = o.fill;
    if (o.fmt) c.numFmt = o.fmt;
    if (o.align) c.alignment = o.align;
    if (o.borde) c.border = BORDE;
  };
  const centro: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const proyecto = d.proyecto;

  set(ws, 'A1', `COMPARATIVO ${p.numero_app}${proyecto ? ' – ' + proyecto : ''}`, { font: { bold: true, size: 14 } });
  set(ws, 'A2', `Generado el ${new Date().toLocaleDateString('es-ES')} desde la app de compras · Importes sin IVA`, { font: { italic: true, color: { argb: GRIS } } });
  set(ws, 'A3', 'Celdas amarillas con texto azul = datos editables. Pronto pago y rappel vienen de Administración → Condiciones comerciales. Rellena el precio oferta (venta al cliente) para ver el margen.', {
    font: { italic: true, color: { argb: GRIS } },
  });

  const etiquetas: Record<number, string> = {
    5: 'Proveedor / oferta',
    6: 'Nota',
    7: '¿Oferta vigente? (SÍ/NO)',
    8: 'Pronto pago',
    9: 'Coste financiero (condiciones de pago)',
    10: 'Rappel',
    11: 'Factor neto = (1−PP)·(1+CF)·(1−Rappel)',
  };
  for (const [r, t] of Object.entries(etiquetas)) {
    ws.mergeCells(`D${r}:G${r}`);
    set(ws, `D${r}`, t, { font: { bold: true }, align: { horizontal: 'right' } });
  }
  ofertas.forEach((o, i) => {
    const [pc, , tc] = cols(i);
    for (let r = 5; r <= 11; r++) {
      ws.mergeCells(`${pc}${r}:${tc}${r}`);
    }
    set(ws, `${pc}5`, o.nombre, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: F_CAB, align: centro, borde: true });
    set(ws, `${pc}6`, o.nota, { font: { color: { argb: AZUL } }, fill: F_IN, align: centro, borde: true });
    set(ws, `${pc}7`, o.vigente ? 'SÍ' : 'NO', { font: { bold: true, color: { argb: AZUL } }, fill: F_IN, align: centro, borde: true });
    set(ws, `${pc}8`, o.pp, { font: { color: { argb: AZUL } }, fill: F_IN, fmt: PCT, align: centro, borde: true });
    set(ws, `${pc}9`, 0, { font: { color: { argb: AZUL } }, fill: F_IN, fmt: PCT, align: centro, borde: true });
    set(ws, `${pc}10`, o.rappel, { font: { color: { argb: AZUL } }, fill: F_IN, fmt: PCT, align: centro, borde: true });
    set(ws, `${pc}11`, `=(1-${pc}8)*(1+${pc}9)*(1-${pc}10)`, { font: { bold: true }, fmt: '0.0000', align: centro, borde: true });
  });

  set(ws, 'B8', 'Precio oferta global', { font: { bold: true } });
  set(ws, 'B9', 'Solo si la oferta al cliente es un importe total y no va por líneas:', { font: { italic: true, size: 9, color: { argb: GRIS } } });
  set(ws, 'B10', null, { font: { bold: true, color: { argb: AZUL } }, fill: F_IN, fmt: EUR, borde: true });
  set(ws, 'B11', '=IF(ISNUMBER(B10),"Margen calculado sobre el precio global","Margen calculado sobre las líneas con precio oferta")', {
    font: { italic: true, size: 9, color: { argb: GRIS } },
  });

  const H1 = 13;
  const H2 = 14;
  const cab: Record<string, string> = { A: 'Código', B: 'Descripción', C: 'Ud', D: 'Cantidad', E: 'Precio oferta', F: 'Total oferta', G: 'Coste ref. ud (si no se oferta)' };
  for (const [c, t] of Object.entries(cab)) {
    ws.mergeCells(`${c}${H1}:${c}${H2}`);
    set(ws, `${c}${H1}`, t);
  }
  ofertas.forEach((_, i) => {
    const [pc, nc, tc] = cols(i);
    ws.mergeCells(`${pc}${H1}:${tc}${H1}`);
    set(ws, `${pc}${H1}`, `=${pc}5`);
    set(ws, `${pc}${H2}`, 'Precio');
    set(ws, `${nc}${H2}`, 'Neto ud');
    set(ws, `${tc}${H2}`, 'Total neto');
  });
  ws.mergeCells(`${cMejor}${H1}:${cTot}${H1}`);
  set(ws, `${cMejor}${H1}`, 'MEJOR NETO (solo ofertas vigentes)');
  set(ws, `${cMejor}${H2}`, 'Neto ud');
  set(ws, `${cProv}${H2}`, 'Proveedor');
  set(ws, `${cTot}${H2}`, 'Total');
  ws.mergeCells(`${cRef}${H1}:${cRef}${H2}`);
  set(ws, `${cRef}${H1}`, 'Valor si no se oferta');
  for (let r = H1; r <= H2; r++)
    for (let c = 1; c <= ULT; c++) {
      const cell = ws.getCell(r, c);
      cell.font = fuente({ bold: true, color: { argb: 'FFFFFFFF' } });
      cell.fill = F_CAB;
      cell.alignment = centro;
      cell.border = BORDE;
    }

  const R0 = H2 + 1;
  items.forEach((it, k: number) => {
    const r = R0 + k;
    set(ws, `A${r}`, it.codigo, { font: { color: { argb: AZUL } }, fill: F_IN });
    set(ws, `B${r}`, it.descripcion, { font: { color: { argb: AZUL } }, fill: F_IN });
    set(ws, `C${r}`, it.unidad, { font: { color: { argb: AZUL } }, fill: F_IN });
    set(ws, `D${r}`, Number(it.cantidad), { font: { color: { argb: AZUL } }, fill: F_IN, fmt: '#,##0.###' });
    set(ws, `E${r}`, null, { font: { color: { argb: AZUL } }, fill: F_IN, fmt: EUR });
    set(ws, `F${r}`, `=IF(ISNUMBER(E${r}),E${r}*D${r},"")`, { fmt: EUR });
    const terminos: string[] = [];
    const partes: string[] = [];
    ofertas.forEach((o, i) => {
      const [pc, nc, tc] = cols(i);
      set(ws, `${pc}${r}`, o.precios[k], { font: { color: { argb: AZUL } }, fill: F_IN, fmt: EUR4 });
      set(ws, `${nc}${r}`, `=IF(ISNUMBER(${pc}${r}),${pc}${r}*${pc}$11,"")`, { fmt: EUR4 });
      set(ws, `${tc}${r}`, `=IF(ISNUMBER(${nc}${r}),${nc}${r}*$D${r},"")`, { fmt: EUR });
      terminos.push(`IF(AND(${pc}$7="SÍ",ISNUMBER(${nc}${r})),${nc}${r},1E+99)`);
      partes.push(`IF(AND(${pc}$7="SÍ",ISNUMBER(${nc}${r})),IF(${nc}${r}=${cMejor}${r},${pc}$5&"|",""),"")`);
    });
    const mn = `MIN(${terminos.join(',')})`;
    set(ws, `${cMejor}${r}`, `=IF(${mn}=1E+99,"",${mn})`, { fmt: EUR4 });
    const lista = partes.join('&');
    set(ws, `${cProv}${r}`, `=IF(${cMejor}${r}="","—",IF(${cMejor}${r}=0,"Incluido",LEFT(${lista},FIND("|",${lista})-1)))`);
    set(ws, `${cTot}${r}`, `=IF(ISNUMBER(${cMejor}${r}),${cMejor}${r}*D${r},"")`, { fmt: EUR });
    set(ws, `G${r}`, null, { font: { color: { argb: AZUL } }, fill: F_IN, fmt: EUR });
    set(ws, `${cRef}${r}`, `=IF(ISNUMBER(G${r}),G${r}*N(D${r}),IF(ISNUMBER(${cTot}${r}),${cTot}${r},0))`, { fmt: EUR });
    for (let c = 1; c <= ULT; c++) ws.getCell(r, c).border = BORDE;
  });
  const R1 = R0 + items.length - 1;

  const RT = R1 + 1;
  set(ws, `B${RT}`, 'TOTAL');
  set(ws, `F${RT}`, `=IF(ISNUMBER($B$10),$B$10,SUM(F${R0}:F${R1}))`);
  ofertas.forEach((_, i) => {
    const [, , tc] = cols(i);
    set(ws, `${tc}${RT}`, `=SUM(${tc}${R0}:${tc}${R1})`);
  });
  set(ws, `${cTot}${RT}`, `=SUM(${cTot}${R0}:${cTot}${R1})`);
  for (let c = 1; c <= ULT; c++) {
    const cell = ws.getCell(RT, c);
    cell.fill = F_SUB;
    cell.border = BORDE;
    cell.font = fuente({ bold: true });
    cell.numFmt = EUR;
  }

  const RR = RT + 2;
  const filas: [string, (pc: string, nc: string, tc: string) => string | null, string | null][] = [
    ['Total bruto (sin condiciones)', (pc) => `=SUMPRODUCT(N(+${pc}${R0}:${pc}${R1}),$D${R0}:$D${R1})`, EUR],
    ['Total neto (con PP, CF y rappel)', (_pc, _nc, tc) => `=${tc}${RT}`, EUR],
    ['Líneas ofertadas', (pc) => `=COUNT(${pc}${R0}:${pc}${R1})&" de "&COUNT($D${R0}:$D${R1})`, null],
    ['Valor de lo no ofertado (coste ref. o mejor neto)', (pc) => `=SUMPRODUCT(--NOT(ISNUMBER(${pc}${R0}:${pc}${R1})),$${cRef}${R0}:$${cRef}${R1})`, EUR],
    ['TOTAL NETO COMPARABLE (todo el material)', (pc) => `=${pc}${RR + 1}+${pc}${RR + 3}`, EUR],
    [
      'Margen s/ precio oferta',
      (pc, _nc, tc) =>
        `=IF(NOT($F$${RT}>0),"",IF(ISNUMBER($B$10),1-${pc}${RR + 4}/$B$10,1-(SUMPRODUCT(--ISNUMBER($E${R0}:$E${R1}),N(+${tc}${R0}:${tc}${R1}))+SUMPRODUCT(--ISNUMBER($E${R0}:$E${R1}),--NOT(ISNUMBER(${pc}${R0}:${pc}${R1})),$${cRef}${R0}:$${cRef}${R1}))/$F$${RT}))`,
      PCT,
    ],
    [
      'Margen en € s/ precio oferta',
      (pc, _nc, tc) =>
        `=IF(NOT($F$${RT}>0),"",IF(ISNUMBER($B$10),$B$10-${pc}${RR + 4},$F$${RT}-(SUMPRODUCT(--ISNUMBER($E${R0}:$E${R1}),N(+${tc}${R0}:${tc}${R1}))+SUMPRODUCT(--ISNUMBER($E${R0}:$E${R1}),--NOT(ISNUMBER(${pc}${R0}:${pc}${R1})),$${cRef}${R0}:$${cRef}${R1}))))`,
      EUR,
    ],
  ];
  filas.forEach(([t, fn, fmt], k) => {
    const r = RR + k;
    ws.mergeCells(`B${r}:G${r}`);
    set(ws, `B${r}`, t, { font: { bold: true }, align: { horizontal: 'right' } });
    ofertas.forEach((_, i) => {
      const [pc, nc, tc] = cols(i);
      ws.mergeCells(`${pc}${r}:${tc}${r}`);
      const destacado = t.startsWith('TOTAL NETO COMPARABLE');
      set(ws, `${pc}${r}`, fn(pc, nc, tc), { fmt: fmt || undefined, align: centro, borde: true, font: { bold: destacado }, fill: destacado ? F_SUB : undefined });
    });
  });
  const RCOMP = RR + 4;

  // Formato condicional: mejor neto en verde, no ofertado en naranja, no vigentes en gris
  ofertas.forEach((_, i) => {
    const [pc, nc, tc] = cols(i);
    ws.addConditionalFormatting({
      ref: `${nc}${R0}:${nc}${R1}`,
      rules: [{ type: 'expression', priority: 1, formulae: [`AND(${pc}$7="SÍ",ISNUMBER(${nc}${R0}),${nc}${R0}=$${cMejor}${R0})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { bold: true } } }],
    });
    ws.addConditionalFormatting({
      ref: `${pc}${R0}:${pc}${R1}`,
      rules: [{ type: 'expression', priority: 2, formulae: [`AND(${pc}$7="SÍ",NOT(ISNUMBER(${pc}${R0})))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCE4D6' } } } }],
    });
    ws.addConditionalFormatting({
      ref: `${pc}5:${tc}${RR + 6}`,
      rules: [{ type: 'expression', priority: 3, formulae: [`$${pc}$7<>"SÍ"`], style: { font: { color: { argb: 'FFA6A6A6' }, italic: true } } }],
    });
  });

  ws.getColumn('A').width = 12;
  ws.getColumn('B').width = 42;
  ws.getColumn('C').width = 6;
  ['D', 'E', 'F', 'G'].forEach((c) => (ws.getColumn(c).width = 13));
  ofertas.forEach((_, i) => cols(i).forEach((c) => (ws.getColumn(c).width = 13)));
  [cMejor, cProv, cTot, cRef].forEach((c) => (ws.getColumn(c).width = 15));
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: R0 - 1 }];

  // ---------------- Resumen ----------------
  const C = 'Comparativo!';
  set(res, 'A1', `COMPARATIVO ${p.numero_app} · RESUMEN`, { font: { bold: true, size: 14 } });
  set(res, 'A2', 'Precios netos = precio de la oferta con pronto pago, coste financiero y rappel. Sin IVA.', { font: { italic: true, color: { argb: GRIS } } });
  set(res, 'A4', 'Tipo de compra:', { font: { bold: true } });
  res.mergeCells('B4:C4');
  set(res, 'B4', 'Reparto permitido', { font: { bold: true, color: { argb: AZUL } }, fill: F_IN });
  res.getCell('B4').dataValidation = { type: 'list', allowBlank: false, formulae: ['"Reparto permitido,Proveedor único"'] };
  set(res, 'D4', '← elige "Proveedor único" o "Reparto permitido"', { font: { italic: true, color: { argb: GRIS } } });

  set(res, 'A6', 'A · ADJUDICACIÓN A UN ÚNICO PROVEEDOR', { font: { bold: true, size: 11 } });
  const cabA = ['Proveedor / oferta', 'Vigente', 'Líneas ofertadas', 'Total bruto', 'Total neto', 'No ofertado (valorado)', 'Neto comparable', 'Dif. vs mejor', 'Margen s/ oferta', 'Margen €', 'Posición', 'aux'];
  cabA.forEach((t, j) => set(res, `${L(1 + j)}7`, t, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: F_CAB, align: centro, borde: true }));
  const A0 = 8;
  const A1r = A0 + N - 1;
  const B0 = A1r + 3;
  const rB = B0 + 2;
  const rBt = rB + N;
  const K0 = rBt + 2;
  ofertas.forEach((_, i) => {
    const [pc] = cols(i);
    const r = A0 + i;
    set(res, `A${r}`, `=${C}${pc}5`, { borde: true });
    set(res, `B${r}`, `=${C}${pc}7`, { borde: true, align: { horizontal: 'center' } });
    set(res, `C${r}`, `=${C}${pc}${RR + 2}`, { borde: true, align: { horizontal: 'center' } });
    set(res, `D${r}`, `=${C}${pc}${RR}`, { borde: true, fmt: EUR });
    set(res, `E${r}`, `=${C}${pc}${RR + 1}`, { borde: true, fmt: EUR });
    set(res, `F${r}`, `=${C}${pc}${RR + 3}`, { borde: true, fmt: EUR });
    set(res, `G${r}`, `=${C}${pc}${RCOMP}`, { borde: true, fmt: EUR });
    set(res, `H${r}`, `=IF(B${r}="SÍ",G${r}-$C$${K0 + 2},"")`, { borde: true, fmt: EUR });
    set(res, `I${r}`, `=${C}${pc}${RR + 5}`, { borde: true, fmt: PCT });
    set(res, `J${r}`, `=${C}${pc}${RR + 6}`, { borde: true, fmt: EUR });
    set(res, `K${r}`, `=IF(B${r}="SÍ",COUNTIFS($B$${A0}:$B$${A1r},"SÍ",$G$${A0}:$G$${A1r},"<"&G${r})+1,"histórico")`, { borde: true, align: { horizontal: 'center' } });
    set(res, `L${r}`, `=IF(B${r}="SÍ",G${r},1E+99)`, { font: { color: { argb: 'FFBFBFBF' } } });
    set(res, `M${r}`, `=COUNT(${C}${pc}${R0}:${pc}${R1})`, { font: { color: { argb: 'FFBFBFBF' } } });
  });
  res.addConditionalFormatting({
    ref: `A${A0}:K${A1r}`,
    rules: [
      { type: 'expression', priority: 1, formulae: [`$K${A0}=1`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { bold: true } } },
      { type: 'expression', priority: 2, formulae: [`$B${A0}<>"SÍ"`], style: { font: { color: { argb: 'FFA6A6A6' }, italic: true } } },
    ],
  });

  set(res, `A${B0}`, 'B · REPARTO POR LÍNEAS (cada línea al mejor neto vigente)', { font: { bold: true, size: 11 } });
  ['Proveedor / oferta', 'Líneas adjudicadas', 'Importe neto'].forEach((t, j) =>
    set(res, `${L(1 + j)}${B0 + 1}`, t, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: F_CAB, align: centro, borde: true })
  );
  ofertas.forEach((_, i) => {
    const [pc] = cols(i);
    const r = rB + i;
    set(res, `A${r}`, `=${C}${pc}5`, { borde: true });
    set(res, `B${r}`, `=COUNTIF(${C}$${cProv}$${R0}:$${cProv}$${R1},A${r})`, { borde: true, align: { horizontal: 'center' } });
    set(res, `C${r}`, `=SUMIF(${C}$${cProv}$${R0}:$${cProv}$${R1},A${r},${C}$${cTot}$${R0}:$${cTot}$${R1})`, { borde: true, fmt: EUR });
  });
  set(res, `A${rBt}`, 'TOTAL REPARTO', { font: { bold: true }, fill: F_SUB, borde: true });
  set(res, `B${rBt}`, `=SUM(B${rB}:B${rBt - 1})`, { font: { bold: true }, fill: F_SUB, borde: true, align: { horizontal: 'center' } });
  set(res, `C${rBt}`, `=${C}${cTot}${RT}`, { font: { bold: true }, fill: F_SUB, borde: true, fmt: EUR });

  set(res, `A${K0}`, 'COMPARACIÓN', { font: { bold: true, size: 11 } });
  const comp: [string, string, string | null][] = [
    ['Mejor proveedor único (neto comparable)', `=INDEX($A$${A0}:$A$${A1r},MATCH(1,$K$${A0}:$K$${A1r},0))`, null],
    ['Importe mejor proveedor único', `=MIN($L$${A0}:$L$${A1r})`, EUR],
    ['Importe reparto por líneas', `=C${rBt}`, EUR],
    ['Ahorro del reparto frente al proveedor único', `=C${K0 + 2}-C${K0 + 3}`, EUR],
    ['Proveedores necesarios en el reparto', `=COUNTIF(B${rB}:B${rBt - 1},">0")`, null],
    ['Líneas que no cotiza el mejor proveedor único', `=COUNT(${C}$D$${R0}:$D$${R1})-INDEX($M$${A0}:$M$${A1r},MATCH(1,$K$${A0}:$K$${A1r},0))`, null],
  ];
  comp.forEach(([t, fo, fmt], k) => {
    const r = K0 + 1 + k;
    res.mergeCells(`A${r}:B${r}`);
    set(res, `A${r}`, t, { font: { bold: true } });
    set(res, `C${r}`, fo, { font: { bold: true }, fmt: fmt || undefined, borde: true, align: { horizontal: 'center' } });
  });
  const RREC = K0 + comp.length + 1;
  res.mergeCells(`A${RREC}:B${RREC}`);
  set(res, `A${RREC}`, 'RECOMENDACIÓN', { font: { bold: true } });
  res.mergeCells(`C${RREC}:K${RREC}`);
  set(
    res,
    `C${RREC}`,
    `=IF(OR($B$4="Proveedor único",C${K0 + 5}=1,C${K0 + 4}<=0),"Adjudicar a "&C${K0 + 1}&IF(C${K0 + 6}>0," lo que cotiza (le faltan "&C${K0 + 6}&" línea(s): cómpralas aparte, ver reparto)","")&" · total "&TEXT(C${K0 + 2},"#,##0.00")&" €","Repartir entre "&C${K0 + 5}&" proveedores: ahorro de "&TEXT(C${K0 + 4},"#,##0.00")&" € frente a "&C${K0 + 1})`,
    { font: { bold: true, size: 11, color: { argb: 'FF1F4E3D' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } } }
  );
  const notas = [
    'Solo compiten las ofertas vigentes; las versiones anteriores de un mismo proveedor quedan en gris como histórico.',
    'El mejor precio de cada línea se busca sobre el precio NETO (con pronto pago, coste financiero y rappel).',
    'Si un proveedor no cotiza alguna línea, su "neto comparable" incluye esa línea valorada a su coste de referencia o al mejor neto vigente.',
    'El reparto no incluye portes ni pedidos mínimos: si cambian al dividir el pedido, súmalos antes de decidir.',
  ];
  set(res, `A${RREC + 2}`, 'Notas', { font: { bold: true } });
  notas.forEach((t, k) => set(res, `A${RREC + 3 + k}`, '• ' + t, { font: { size: 9, color: { argb: GRIS } } }));
  res.getColumn('A').width = 34;
  ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((c, k) => (res.getColumn(c).width = [13, 15, 14, 14, 16, 16, 14, 14, 14, 11][k]));
  res.getColumn('L').hidden = true;
  res.getColumn('M').hidden = true;

  for (const h of [ws, res]) h.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
