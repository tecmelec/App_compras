import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerProveedorPedidosCompraBC, obtenerUltimasComprasArticuloBC } from '@/lib/business-central';

// Comprador IA — Fase 1, paso 3: a qué proveedores pedir oferta para unas líneas.
// Sugerencias por línea (de más a menos peso):
//   - proveedores que han vendido ese artículo (últimas compras en BC)
//   - proveedor predeterminado del artículo
//   - proveedores habituales de la misma categoría en la app (solicitudes anteriores)
// Máximo 3 sugerencias por línea.

export type LineaPeticion = {
  itemId: string;
  articulo: string;
  bcItemNo: string | null;
  cantidad: number;
  unidad: string;
};

export type GrupoPeticion = {
  proveedorId: string;
  proveedorNo: string;
  proveedorNombre: string;
  itemIds: string[];
  motivos: string[];
};

export async function sugerirProveedoresOferta(pedidoId: string, itemIds: string[]) {
  const admin = createAdminClient();
  const { data: items } = await admin
    .from('pedido_items')
    .select('id, cantidad, productos(nombre, bc_item_no, unidad_medida, categoria, proveedor_predeterminado_id)')
    .eq('pedido_id', pedidoId)
    .in('id', itemIds);

  const lineas: LineaPeticion[] = (items || []).map((it: any) => ({
    itemId: it.id,
    articulo: it.productos?.nombre || 'Producto',
    bcItemNo: it.productos?.bc_item_no || null,
    cantidad: Number(it.cantidad),
    unidad: it.productos?.unidad_medida || 'ud.',
  }));

  // item → lista ordenada de { proveedor (id app o Nº BC), motivo }
  const sugerencias = new Map<string, { clave: string; motivo: string }[]>();
  const anadir = (itemId: string, clave: string | null, motivo: string) => {
    if (!clave) return;
    const l = sugerencias.get(itemId) || [];
    if (!l.some((x) => x.clave === clave)) l.push({ clave, motivo });
    sugerencias.set(itemId, l);
  };

  // 1. Quien ha vendido ese artículo (BC)
  const porBC = (items || []).filter((it: any) => it.productos?.bc_item_no);
  const compras = await Promise.all(
    porBC.map((it: any) => obtenerUltimasComprasArticuloBC(it.productos.bc_item_no, 8).catch(() => []))
  );
  const docs = Array.from(new Set(compras.flat().map((c) => c.Document_No)));
  const cab = new Map<string, { vendorNo: string }>();
  for (let k = 0; k < docs.length; k += 40) {
    try {
      (await obtenerProveedorPedidosCompraBC(docs.slice(k, k + 40))).forEach((v, key) => cab.set(key, v));
    } catch {
      /* sin cabeceras: se usa el proveedor de la línea si viene */
    }
  }
  porBC.forEach((it: any, i: number) => {
    for (const c of compras[i]) anadir(it.id, `no:${cab.get(c.Document_No)?.vendorNo || c.Buy_from_Vendor_No || ''}`, 'Ya os ha vendido este artículo');
  });

  // 2. Proveedor predeterminado
  for (const it of items || []) anadir((it as any).id, (it as any).productos?.proveedor_predeterminado_id ? `id:${(it as any).productos.proveedor_predeterminado_id}` : null, 'Proveedor predeterminado del artículo');

  // 3. Habituales de la misma categoría (líneas con proveedor en solicitudes anteriores)
  const categorias = Array.from(new Set((items || []).map((it: any) => it.productos?.categoria).filter(Boolean)));
  if (categorias.length) {
    const { data: prods } = await admin.from('productos').select('id, categoria').in('categoria', categorias).limit(5000);
    const catPorProducto = new Map((prods || []).map((p: any) => [p.id, p.categoria]));
    const ids = Array.from(catPorProducto.keys());
    const cuenta = new Map<string, Map<string, number>>(); // categoría → proveedor → nº
    for (let k = 0; k < ids.length && k < 2000; k += 200) {
      const { data: lineasCat } = await admin
        .from('pedido_items')
        .select('producto_id, proveedor_id')
        .in('producto_id', ids.slice(k, k + 200))
        .not('proveedor_id', 'is', null)
        .limit(2000);
      for (const l of lineasCat || []) {
        const cat = catPorProducto.get((l as any).producto_id);
        if (!cat) continue;
        const m = cuenta.get(cat) || new Map<string, number>();
        m.set((l as any).proveedor_id, (m.get((l as any).proveedor_id) || 0) + 1);
        cuenta.set(cat, m);
      }
    }
    for (const it of items || []) {
      const cat = (it as any).productos?.categoria;
      const top = Array.from(cuenta.get(cat)?.entries() || []).sort((a, b) => b[1] - a[1]).slice(0, 2);
      for (const [provId] of top) anadir((it as any).id, `id:${provId}`, `Proveedor habitual de la categoría ${cat}`);
    }
  }

  // Resolver claves a proveedores de la app
  const claves = Array.from(new Set(Array.from(sugerencias.values()).flat().map((s) => s.clave)));
  const ids = claves.filter((c) => c.startsWith('id:')).map((c) => c.slice(3));
  const nos = claves.filter((c) => c.startsWith('no:')).map((c) => c.slice(3)).filter(Boolean);
  const [{ data: porId }, { data: porNo }] = await Promise.all([
    ids.length ? admin.from('proveedores').select('id, bc_proveedor_no, nombre').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    nos.length ? admin.from('proveedores').select('id, bc_proveedor_no, nombre').in('bc_proveedor_no', nos) : Promise.resolve({ data: [] as any[] }),
  ]);
  const resolver = new Map<string, any>();
  for (const p of porId || []) resolver.set(`id:${p.id}`, p);
  for (const p of porNo || []) resolver.set(`no:${p.bc_proveedor_no}`, p);

  const grupos = new Map<string, GrupoPeticion>();
  for (const l of lineas) {
    let n = 0;
    for (const s of sugerencias.get(l.itemId) || []) {
      const p = resolver.get(s.clave);
      if (!p || n >= 3) continue;
      n++;
      const g: GrupoPeticion = grupos.get(p.id) || {
        proveedorId: p.id,
        proveedorNo: p.bc_proveedor_no,
        proveedorNombre: p.nombre || '',
        itemIds: [] as string[],
        motivos: [] as string[],
      };
      if (!g.itemIds.includes(l.itemId)) g.itemIds.push(l.itemId);
      if (!g.motivos.includes(s.motivo)) g.motivos.push(s.motivo);
      grupos.set(p.id, g);
    }
  }
  return {
    lineas,
    grupos: Array.from(grupos.values()).sort((a, b) => b.itemIds.length - a.itemIds.length),
  };
}
