import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerProveedorPedidosCompraBC, obtenerUltimasComprasArticuloBC } from '@/lib/business-central';
import type { LineaPresupuesto, ProveedorPresupuesto } from '@/lib/presupuesto';
import { obtenerTodosLosProveedores } from '@/lib/proveedores-utils';
import { referenciaEnDescripcion } from '@/lib/referencia-proveedor';

// Comprador IA — Fase 1, paso 1: propuesta de proveedor y precio por línea calculada
// con reglas fijas (sin IA). Prioridad de fuentes:
//   1. presupuesto adjunto a esta solicitud                       → confianza alta
//      (línea del presupuesto asignada al artículo, o cuya referencia del proveedor
//      aparece en la descripción de nuestro artículo)
//   2. presupuesto de otra solicitud de los últimos N días         → alta
//   3. última compra en BC de los últimos M meses (mismo proyecto
//      antes que otro proyecto)                                    → alta (media si el
//                                                                    precio varía > X %)
//   4. última compra en BC más antigua                             → media
//   5. proveedor predeterminado + precio del catálogo              → baja
//   sin datos                                                       → "Pedir oferta"
// Después, agrupación: una línea se pasa al proveedor que lleva más líneas si este la
// tiene por menos de un Y % más.

export type ParametrosPropuesta = {
  diasPresupuesto: number;
  mesesCompras: number;
  pctAgrupar: number;
  pctVariacion: number;
  iaActiva: boolean;
};

export type Confianza = 'alta' | 'media' | 'baja';

export type OrigenPropuesta =
  | 'presupuesto'
  | 'presupuesto_otra'
  | 'compra_reciente'
  | 'compra_antigua'
  | 'catalogo'
  | 'pedir_oferta';

type Candidato = {
  proveedorId: string | null;
  proveedorNo: string | null;
  proveedorNombre: string | null;
  precio: number;
  origen: OrigenPropuesta;
  origenTexto: string;
  fecha: string | null; // AAAA-MM-DD
  confianza: Confianza;
  presupuestoId?: string | null; // presupuesto de esta solicitud
};

export type LineaPropuesta = {
  itemId: string;
  articulo: string;
  bcItemNo: string | null;
  cantidad: number;
  unidad: string;
  actual: { proveedorId: string | null; proveedorNombre: string | null; precio: number | null };
  propuesta: {
    proveedorId: string | null;
    proveedorNo: string | null;
    proveedorNombre: string | null;
    precio: number | null;
    origen: OrigenPropuesta;
    origenTexto: string;
    fecha: string | null;
    confianza: Confianza | null;
    presupuestoId: string | null;
    precioNeto?: number | null; // con pronto pago y rappel de Condiciones comerciales (si las hay)
  };
  notas: string[];
};

const ORDEN_CONFIANZA: Record<Confianza, number> = { alta: 3, media: 2, baja: 1 };

const normalizar = (s: string | null | undefined) => (s || '').replace(/[\s.\-_/]/g, '').toUpperCase();
const fmtEur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtFecha = (f: string | null) => (f ? new Date(f + 'T00:00:00').toLocaleDateString('es-ES') : 'fecha desconocida');
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

export async function leerParametrosPropuesta(): Promise<ParametrosPropuesta> {
  const { data } = await createAdminClient()
    .from('configuracion')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  return {
    diasPresupuesto: Number(data?.propuesta_dias_presupuesto ?? 90),
    mesesCompras: Number(data?.propuesta_meses_compras ?? 6),
    pctAgrupar: Number(data?.propuesta_pct_agrupar ?? 5),
    pctVariacion: Number(data?.propuesta_pct_variacion ?? 10),
    iaActiva: data?.propuesta_ia_activa !== false,
  };
}

// Ejecuta tareas con un máximo de N a la vez (para no saturar BC).
async function enParalelo<T, R>(datos: T[], n: number, fn: (d: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(datos.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, datos.length) }, async () => {
      while (i < datos.length) {
        const k = i++;
        res[k] = await fn(datos[k]);
      }
    })
  );
  return res;
}

export async function calcularPropuestaCompra(pedidoId: string, params: ParametrosPropuesta) {
  const admin = createAdminClient();

  const { data: pedido } = await admin
    .from('pedidos')
    .select('id, proyectos(bc_job_no), pedido_items(id, cantidad, numero_tecmelec, rechazada_por_aprobador, proveedor_id, precio_unitario, producto_id, productos(nombre, bc_item_no, precio, unidad_medida, proveedor_predeterminado_id))')
    .eq('id', pedidoId)
    .single();
  if (!pedido) throw new Error('Solicitud no encontrada.');
  const proyecto = ((pedido as any).proyectos?.bc_job_no || '').trim().toUpperCase();

  // Solo líneas sin pedido de compra, no rechazadas y con cantidad.
  const items = ((pedido as any).pedido_items || []).filter(
    (i: any) => !i.numero_tecmelec && !i.rechazada_por_aprobador && Number(i.cantidad) > 0
  );
  if (items.length === 0) return { lineas: [] as LineaPropuesta[] };

  // Proveedores de la app (para nombres y para pasar de Nº de BC a ficha).
  const { data: provApp } = await obtenerTodosLosProveedores(admin);
  const provPorId = new Map((provApp || []).map((p: any) => [p.id as string, p]));
  const provPorNo = new Map((provApp || []).map((p: any) => [p.bc_proveedor_no as string, p]));

  const candidatos = new Map<string, Candidato[]>(); // por item
  const notasPorItem = new Map<string, string[]>();
  const anadir = (itemId: string, c: Candidato) => {
    if (!candidatos.has(itemId)) candidatos.set(itemId, []);
    candidatos.get(itemId)!.push(c);
  };
  const nota = (itemId: string, t: string) => {
    if (!notasPorItem.has(itemId)) notasPorItem.set(itemId, []);
    notasPorItem.get(itemId)!.push(t);
  };

  // ---- 1 y 2. Presupuestos (esta solicitud y otras de los últimos N días) ----
  const desde = new Date(Date.now() - params.diasPresupuesto * 86400000).toISOString().slice(0, 10);
  const { data: presupuestos } = await admin
    .from('presupuestos')
    .select('id, pedido_id, proveedor, lineas, asignaciones, created_at')
    .or(`pedido_id.eq.${pedidoId},created_at.gte.${desde}`)
    .order('created_at', { ascending: false })
    .limit(500);
  // Asignaciones de presupuestos de otras solicitudes: item → artículo de BC.
  const idsAsignadosOtras = Array.from(
    new Set(
      (presupuestos || [])
        .filter((p: any) => p.pedido_id !== pedidoId)
        .flatMap((p: any) => ((p.asignaciones || []) as any[]).map((a) => a.item_id))
    )
  );
  const bcPorItemOtras = new Map<string, string>();
  for (let k = 0; k < idsAsignadosOtras.length; k += 200) {
    const { data } = await admin
      .from('pedido_items')
      .select('id, productos(bc_item_no)')
      .in('id', idsAsignadosOtras.slice(k, k + 200));
    for (const d of data || []) if ((d as any).productos?.bc_item_no) bcPorItemOtras.set((d as any).id, (d as any).productos.bc_item_no);
  }

  for (const p of presupuestos || []) {
    const esta = (p as any).pedido_id === pedidoId;
    const prov = ((p as any).proveedor || {}) as ProveedorPresupuesto;
    const lineasP = ((p as any).lineas || []) as LineaPresupuesto[];
    const asign = ((p as any).asignaciones || []) as { item_id: string; linea_idx: number; precio?: number }[];
    const fecha = String((p as any).created_at).slice(0, 10);
    const provId = prov.proveedor_id || null;
    const provNombre = (provId && provPorId.get(provId)?.nombre) || prov.bc_nombre || prov.nombre || null;
    const provNo = (provId && provPorId.get(provId)?.bc_proveedor_no) || prov.bc_no || null;
    for (const it of items) {
      const bc = normalizar(it.productos?.bc_item_no);
      let linea: LineaPresupuesto | undefined;
      // Asignación hecha a mano en "Asignar precios desde presupuesto"
      const a = esta
        ? asign.find((x) => x.item_id === it.id)
        : asign.find((x) => bc && normalizar(bcPorItemOtras.get(x.item_id)) === bc);
      if (a) linea = lineasP.find((l) => l.idx === a.linea_idx);
      // O por referencia igual al código de BC
      if (!linea && bc) linea = lineasP.find((l) => normalizar(l.referencia) === bc);
      // O por la referencia del proveedor contenida en la descripción de nuestro artículo
      if (!linea) linea = lineasP.find((l) => referenciaEnDescripcion(l.referencia, it.productos?.nombre));
      if (!linea || linea.precio_unitario == null || !(linea.precio_unitario > 0)) continue;
      anadir(it.id, {
        proveedorId: provId,
        proveedorNo: provNo,
        proveedorNombre: provNombre,
        precio: Number(linea.precio_unitario),
        origen: esta ? 'presupuesto' : 'presupuesto_otra',
        origenTexto: esta ? `Presupuesto de esta solicitud (${fmtFecha(fecha)})` : `Presupuesto de otra solicitud (${fmtFecha(fecha)})`,
        fecha,
        confianza: 'alta',
        presupuestoId: esta ? (p as any).id : null,
      });
    }
  }

  // ---- 3 y 4. Últimas compras en BC ----
  const conBC = items.filter((it: any) => it.productos?.bc_item_no);
  const comprasPorItem = new Map<string, Awaited<ReturnType<typeof obtenerUltimasComprasArticuloBC>>>();
  const erroresBC: string[] = [];
  await enParalelo(conBC, 4, async (it: any) => {
    try {
      comprasPorItem.set(it.id, await obtenerUltimasComprasArticuloBC(it.productos.bc_item_no, 10));
    } catch (e: any) {
      erroresBC.push(`${it.productos.bc_item_no}: ${e?.message || e}`);
    }
  });
  const documentos = Array.from(new Set(Array.from(comprasPorItem.values()).flat().map((l) => l.Document_No)));
  const cabeceras = new Map<string, { vendorNo: string; vendorName: string | null; orderDate: string | null }>();
  for (let k = 0; k < documentos.length; k += 40) {
    try {
      const m = await obtenerProveedorPedidosCompraBC(documentos.slice(k, k + 40));
      m.forEach((v, key) => cabeceras.set(key, v));
    } catch (e: any) {
      erroresBC.push(`cabeceras de pedidos: ${e?.message || e}`);
    }
  }
  const limiteReciente = new Date();
  limiteReciente.setMonth(limiteReciente.getMonth() - params.mesesCompras);
  const limiteRecienteStr = limiteReciente.toISOString().slice(0, 10);

  for (const it of conBC) {
    const compras = (comprasPorItem.get(it.id) || [])
      .map((l) => {
        const cab = cabeceras.get(l.Document_No);
        const vendorNo = cab?.vendorNo || l.Buy_from_Vendor_No || null;
        const prov = vendorNo ? provPorNo.get(vendorNo) : undefined;
        return {
          pedido: l.Document_No,
          fecha: cab?.orderDate || null,
          proveedorNo: vendorNo,
          proveedorId: (prov?.id as string) || null,
          proveedorNombre: (prov?.nombre as string) || cab?.vendorName || l.Buy_from_Vendor_Name || null,
          proyecto: (l.Job_No || '').trim().toUpperCase(),
          precio: l.Quantity ? Number((l.Line_Amount / l.Quantity).toFixed(5)) : 0,
        };
      })
      .filter((c) => c.precio > 0)
      .sort((a, b) => (b.fecha || b.pedido).localeCompare(a.fecha || a.pedido));
    if (compras.length === 0) continue;

    const recientes = compras.filter((c) => c.fecha && c.fecha >= limiteRecienteStr);
    // En el periodo reciente, la del mismo proyecto pesa más; si no, la más reciente.
    const elegida = recientes.find((c) => proyecto && c.proyecto === proyecto) || recientes[0] || compras[0];
    const esReciente = recientes.includes(elegida);
    let confianza: Confianza = esReciente ? 'alta' : 'media';
    if (recientes.length >= 2) {
      const precios = recientes.map((c) => c.precio);
      const varia = pct(Math.max(...precios), Math.min(...precios));
      if (varia > params.pctVariacion) {
        confianza = 'media';
        nota(it.id, `El precio varía un ${Math.round(varia)} % entre las compras de los últimos ${params.mesesCompras} meses.`);
      }
    }
    const anterior = compras.find((c) => c !== elegida && (c.fecha || '') <= (elegida.fecha || ''));
    if (anterior) {
      const dif = pct(elegida.precio, anterior.precio);
      if (Math.abs(dif) > params.pctVariacion) {
        nota(
          it.id,
          `${dif > 0 ? 'Subida' : 'Bajada'} del ${Math.abs(Math.round(dif))} % respecto a la compra del ${fmtFecha(anterior.fecha)} (${fmtEur(anterior.precio)} €).`
        );
      }
    }
    if (!esReciente) nota(it.id, `Última compra hace más de ${params.mesesCompras} meses (${fmtFecha(elegida.fecha)}): conviene confirmar el precio.`);
    if (!elegida.proveedorId) nota(it.id, `El proveedor ${elegida.proveedorNo || ''} no está en la app: no se podrá aplicar el proveedor.`);
    anadir(it.id, {
      proveedorId: elegida.proveedorId,
      proveedorNo: elegida.proveedorNo,
      proveedorNombre: elegida.proveedorNombre,
      precio: elegida.precio,
      origen: esReciente ? 'compra_reciente' : 'compra_antigua',
      origenTexto: `Última compra en BC ${elegida.pedido} (${fmtFecha(elegida.fecha)})${
        proyecto && elegida.proyecto === proyecto ? ' · mismo proyecto' : ''
      }`,
      fecha: elegida.fecha,
      confianza,
    });
    // El resto de proveedores con compras sirven de alternativa para agrupar.
    const vistos = new Set([elegida.proveedorId || elegida.proveedorNo]);
    for (const c of compras) {
      const k = c.proveedorId || c.proveedorNo;
      if (vistos.has(k)) continue;
      vistos.add(k);
      anadir(it.id, {
        proveedorId: c.proveedorId,
        proveedorNo: c.proveedorNo,
        proveedorNombre: c.proveedorNombre,
        precio: c.precio,
        origen: c.fecha && c.fecha >= limiteRecienteStr ? 'compra_reciente' : 'compra_antigua',
        origenTexto: `Compra en BC ${c.pedido} (${fmtFecha(c.fecha)})`,
        fecha: c.fecha,
        confianza: c.fecha && c.fecha >= limiteRecienteStr ? 'media' : 'baja',
      });
    }
  }

  // ---- 5. Proveedor predeterminado + precio del catálogo ----
  for (const it of items) {
    const provId = it.productos?.proveedor_predeterminado_id || null;
    const precio = Number(it.productos?.precio || 0);
    if (!provId || !(precio > 0)) continue;
    const prov = provPorId.get(provId);
    anadir(it.id, {
      proveedorId: provId,
      proveedorNo: (prov?.bc_proveedor_no as string) || null,
      proveedorNombre: (prov?.nombre as string) || null,
      precio,
      origen: 'catalogo',
      origenTexto: 'Proveedor predeterminado y precio del catálogo de la tienda',
      fecha: null,
      confianza: 'baja',
    });
  }

  // ---- Condiciones comerciales (pronto pago y rappel por proveedor) ----
  // Las ofertas se comparan en NETO; el precio que se propone y se aplica es el bruto
  // (el que va al pedido de BC). Si la tabla no existe aún, factor 1.
  const idsCand = Array.from(new Set(Array.from(candidatos.values()).flat().map((c) => c.proveedorId).filter(Boolean))) as string[];
  const factorPorProv = new Map<string, number>();
  if (idsCand.length) {
    const { data: conds } = await admin
      .from('condiciones_proveedor')
      .select('proveedor_id, pronto_pago_pct, rappel_pct')
      .in('proveedor_id', idsCand);
    for (const c of conds || []) {
      factorPorProv.set(
        (c as any).proveedor_id,
        (1 - Number((c as any).pronto_pago_pct || 0) / 100) * (1 - Number((c as any).rappel_pct || 0) / 100)
      );
    }
  }
  const factor = (c: Candidato) => (c.proveedorId && factorPorProv.get(c.proveedorId)) || 1;
  const neto = (c: Candidato) => c.precio * factor(c);
  const txtPrecio = (c: Candidato) =>
    factor(c) !== 1 ? `${fmtEur(c.precio)} € (neto ${fmtEur(Number(neto(c).toFixed(4)))} €)` : `${fmtEur(c.precio)} €`;

  // ---- Elección por prioridad ----
  const PRIORIDAD: OrigenPropuesta[] = ['presupuesto', 'presupuesto_otra', 'compra_reciente', 'compra_antigua', 'catalogo'];
  const elegido = new Map<string, Candidato | null>();
  for (const it of items) {
    const cs = candidatos.get(it.id) || [];
    let mejor: Candidato | null = null;
    for (const o of PRIORIDAD) {
      const delOrigen = cs.filter((c) => c.origen === o);
      if (!delOrigen.length) continue;
      if (o === 'presupuesto' || o === 'presupuesto_otra') {
        // Varias ofertas (de distintos proveedores): la última de cada proveedor y, de
        // ellas, la más barata. Las demás se indican en una nota para comparar.
        const porProveedor = new Map<string, Candidato>();
        for (const c of delOrigen) {
          const k = c.proveedorId || c.proveedorNo || c.proveedorNombre || '?';
          if (!porProveedor.has(k)) porProveedor.set(k, c); // los presupuestos vienen del más reciente al más antiguo
        }
        const ofertas = Array.from(porProveedor.values()).sort((a, b) => neto(a) - neto(b));
        mejor = ofertas[0];
        if (ofertas.length > 1) {
          nota(
            it.id,
            `${ofertas.length} ofertas (comparadas en neto): ` +
              ofertas
                .map((c, k) =>
                  k === 0
                    ? `${c.proveedorNombre || c.proveedorNo} ${txtPrecio(c)} (la más barata)`
                    : `${c.proveedorNombre || c.proveedorNo} ${txtPrecio(c)} (+${Math.round(pct(neto(c), neto(ofertas[0])))} %)`
                )
                .join(' · ')
          );
        }
      } else {
        // el primero añadido de ese origen es el preferido (más reciente / mismo proyecto)
        mejor = delOrigen[0];
      }
      break;
    }
    elegido.set(it.id, mejor);
  }

  // ---- Agrupación: pasar líneas al proveedor que lleva más líneas si sale ≤ Y % más ----
  const cuenta = new Map<string, number>();
  for (const c of Array.from(elegido.values())) if (c?.proveedorId) cuenta.set(c.proveedorId, (cuenta.get(c.proveedorId) || 0) + 1);
  const principal = Array.from(cuenta.entries()).sort((a, b) => b[1] - a[1])[0];
  if (principal && principal[1] >= 2) {
    const [provPrincipal] = principal;
    for (const it of items) {
      const actual = elegido.get(it.id);
      if (!actual || actual.proveedorId === provPrincipal) continue;
      const alt = (candidatos.get(it.id) || [])
        .filter((c) => c.proveedorId === provPrincipal)
        .sort((a, b) => neto(a) - neto(b))[0];
      if (!alt) continue;
      const dif = pct(neto(alt), neto(actual));
      if (dif <= params.pctAgrupar) {
        const extra = (neto(alt) - neto(actual)) * Number(it.cantidad);
        nota(
          it.id,
          `Agrupado con ${alt.proveedorNombre || alt.proveedorNo} para hacer un pedido menos (${extra >= 0 ? '+' : ''}${fmtEur(
            Number(extra.toFixed(2))
          )} € netos frente a ${actual.proveedorNombre || actual.proveedorNo}).`
        );
        elegido.set(it.id, {
          ...alt,
          confianza: ORDEN_CONFIANZA[alt.confianza] < ORDEN_CONFIANZA[actual.confianza] ? alt.confianza : actual.confianza,
        });
      }
    }
  }

  // ---- Resultado ----
  const lineas: LineaPropuesta[] = items.map((it: any) => {
    const c = elegido.get(it.id) || null;
    const provActual = it.proveedor_id ? provPorId.get(it.proveedor_id) : null;
    const notas = notasPorItem.get(it.id) || [];
    if (c && !(c.precio > 0)) notas.push('Precio a 0: revisar.');
    if (!c && !it.productos?.bc_item_no) notas.push('El artículo no tiene código de BC: no se pueden consultar compras anteriores.');
    return {
      itemId: it.id,
      articulo: it.productos?.nombre || 'Producto',
      bcItemNo: it.productos?.bc_item_no || null,
      cantidad: Number(it.cantidad),
      unidad: it.productos?.unidad_medida || 'ud.',
      actual: {
        proveedorId: it.proveedor_id || null,
        proveedorNombre: (provActual?.nombre as string) || null,
        precio: it.precio_unitario != null ? Number(it.precio_unitario) : null,
      },
      propuesta: c
        ? {
            proveedorId: c.proveedorId,
            proveedorNo: c.proveedorNo,
            proveedorNombre: c.proveedorNombre,
            precio: c.precio,
            origen: c.origen,
            origenTexto: c.origenTexto,
            fecha: c.fecha,
            confianza: c.confianza,
            presupuestoId: c.presupuestoId || null,
            precioNeto: factor(c) !== 1 ? Number(neto(c).toFixed(5)) : null,
          }
        : {
            proveedorId: null,
            proveedorNo: null,
            proveedorNombre: null,
            precio: null,
            origen: 'pedir_oferta',
            origenTexto: 'Sin presupuesto, compras anteriores ni proveedor predeterminado',
            fecha: null,
            confianza: null,
            presupuestoId: null,
            precioNeto: null,
          },
      notas,
    };
  });

  return { lineas, avisos: erroresBC.length ? [`No se pudieron consultar algunas compras en BC (${erroresBC.length}).`] : [] };
}
