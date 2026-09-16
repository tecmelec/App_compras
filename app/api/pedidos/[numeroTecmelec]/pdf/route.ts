import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { obtenerProveedorPorNumeroBC, obtenerPedidoCompraPorDocumentNoBC } from '@/lib/business-central';
import PedidoCompraDocument, { LineaPdf } from '@/lib/pdf/PedidoCompraDocument';

export async function GET(request: NextRequest, { params }: { params: { numeroTecmelec: string } }) {
  try {
    return await generarPdf(params.numeroTecmelec);
  } catch (e: any) {
    console.error('Error generando PDF de pedido:', e);
    return NextResponse.json(
      { error: e?.message || 'Error desconocido', stack: e?.stack || null },
      { status: 500 }
    );
  }
}

async function generarPdf(numeroTecmelecParam: string): Promise<NextResponse> {
  const numeroTecmelec = decodeURIComponent(numeroTecmelecParam);
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse('No autenticado.', { status: 401 });
  }

  // La consulta respeta RLS: si el usuario no tiene acceso a estas líneas, vienen vacías.
  const { data: items } = await supabase
    .from('pedido_items')
    .select('cantidad, precio_unitario, proveedor_id, pedido_id, productos(nombre, bc_item_no, precio, unidad_medida)')
    .eq('numero_tecmelec', numeroTecmelec);

  if (!items || items.length === 0) {
    return new NextResponse('Pedido no encontrado.', { status: 404 });
  }

  const primero = items[0] as any;

  const [{ data: proveedor }, { data: pedido }] = await Promise.all([
    primero.proveedor_id
      ? supabase.from('proveedores').select('bc_proveedor_no, nombre').eq('id', primero.proveedor_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('pedidos')
      .select('nombre_contacto, telefono_contacto, direcciones(direccion, codigo_postal, ciudad, provincia)')
      .eq('id', primero.pedido_id)
      .single(),
  ]);

  let proveedorDireccion = '';
  let proveedorCif = '';
  let fechaEmision = new Date().toLocaleDateString('es-ES');

  if (proveedor?.bc_proveedor_no) {
    try {
      const detalle = await obtenerProveedorPorNumeroBC(proveedor.bc_proveedor_no);
      if (detalle) {
        proveedorDireccion = [detalle.Address, detalle.Post_Code && detalle.City ? `${detalle.Post_Code} ${detalle.City}` : detalle.City]
          .filter(Boolean)
          .join(', ');
        proveedorCif = detalle.VAT_Registration_No || '';
      }
    } catch {
      // Sin datos adicionales del proveedor si BC no responde; el PDF se genera igual.
    }
  }

  try {
    const cabeceraBC = await obtenerPedidoCompraPorDocumentNoBC(numeroTecmelec);
    if (cabeceraBC?.Order_Date) {
      fechaEmision = new Date(cabeceraBC.Order_Date + 'T00:00:00').toLocaleDateString('es-ES');
    }
  } catch {
    // Se mantiene la fecha de hoy como aproximación si BC no responde.
  }

  const d = (pedido as any)?.direcciones;
  const direccionEnvio = d
    ? [d.direccion, d.codigo_postal && d.ciudad ? `CP ${d.codigo_postal}, ${d.ciudad}` : d.ciudad, d.provincia]
        .filter(Boolean)
        .join(', ')
    : '';

  const lineas: LineaPdf[] = items.map((it: any) => ({
    bcItemNo: it.productos?.bc_item_no || '',
    nombre: it.productos?.nombre || '',
    cantidad: it.cantidad,
    unidadMedida: it.productos?.unidad_medida || '',
    precio: it.precio_unitario ?? it.productos?.precio ?? 0,
  }));

  const buffer = await renderToBuffer(
    PedidoCompraDocument({
      numeroTecmelec,
      fechaEmision,
      proveedorNombre: proveedor ? `${proveedor.bc_proveedor_no} - ${proveedor.nombre}` : '',
      proveedorDireccion,
      proveedorCif,
      contacto: (pedido as any)?.nombre_contacto
        ? `${(pedido as any).nombre_contacto}${(pedido as any).telefono_contacto ? ` +34 ${(pedido as any).telefono_contacto}` : ''}`
        : '',
      direccionEnvio,
      lineas,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Pedido_compra_${numeroTecmelec}.pdf"`,
    },
  });
}
