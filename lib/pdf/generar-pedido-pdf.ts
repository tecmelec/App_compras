import { renderToBuffer } from '@react-pdf/renderer';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import {
  obtenerProveedorPorNumeroBC,
  obtenerPedidoCompraPorDocumentNoBC,
  obtenerFichaProveedorPorNumeroBC,
  obtenerCuentasBancariasProveedorBC,
} from '@/lib/business-central';
import PedidoCompraDocument, { LineaPdf } from './PedidoCompraDocument';

export type PedidoCompraPdfResultado = {
  buffer: Buffer;
  proveedorNombre: string;
  proveedorEmails: string[]; // según ficha del proveedor en BC; puede ser []
};

// Arma el PDF de un pedido de compra a partir de su Nº de pedido Tecmelec.
// Usa el cliente de Supabase con sesión (respeta RLS), así que solo debe
// llamarse desde rutas/acciones donde ya se comprobó que hay un usuario logueado.
// Devuelve null si no hay líneas visibles para ese Nº (no existe o sin acceso).
export async function construirPedidoCompraPdf(
  numeroTecmelecParam: string,
  conFotos: boolean
): Promise<PedidoCompraPdfResultado | null> {
  const numeroTecmelec = decodeURIComponent(numeroTecmelecParam);
  const supabase = createClient();

  const { data: items } = await supabase
    .from('pedido_items')
    .select('cantidad, precio_unitario, proveedor_id, pedido_id, productos(nombre, bc_item_no, precio, unidad_medida, imagen_url)')
    .eq('numero_tecmelec', numeroTecmelec);

  if (!items || items.length === 0) {
    return null;
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
  let formaPago = '';
  let ibanEnmascarado = '';
  let proveedorEmails: string[] = [];

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

    try {
      const ficha = await obtenerFichaProveedorPorNumeroBC(proveedor.bc_proveedor_no);
      if (ficha) {
        const metodo = ficha.Payment_Method_Code === 'TRANSFER' ? 'Transf. bancaria' : ficha.Payment_Method_Code || '';
        formaPago = [metodo, ficha.Payment_Terms_Code].filter(Boolean).join(' - ');
        proveedorEmails = (ficha.E_Mail || '')
          .split(/[;,]/)
          .map((e) => e.trim())
          .filter(Boolean);

        const cuentas = await obtenerCuentasBancariasProveedorBC(proveedor.bc_proveedor_no);
        const cuenta =
          cuentas.find((c) => c.Code === ficha.Preferred_Bank_Account_Code) || cuentas.find((c) => c.IBAN) || null;
        if (cuenta?.IBAN) {
          ibanEnmascarado = enmascararIban(cuenta.IBAN);
        }
      }
    } catch {
      // Sin forma de pago / IBAN / email del proveedor si BC no responde; el PDF usa los valores por defecto.
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

  const lineas: LineaPdf[] = await Promise.all(
    items.map(async (it: any) => ({
      bcItemNo: it.productos?.bc_item_no || '',
      nombre: it.productos?.nombre || '',
      cantidad: it.cantidad,
      unidadMedida: it.productos?.unidad_medida || '',
      precio: it.precio_unitario ?? it.productos?.precio ?? 0,
      imagenUrl:
        conFotos && it.productos?.imagen_url
          ? await prepararImagenParaPdf(it.productos.imagen_url)
          : undefined,
    }))
  );

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
      formaPago,
      ibanEnmascarado,
      conFotos,
    })
  );

  return {
    buffer,
    proveedorNombre: proveedor ? `${proveedor.bc_proveedor_no} - ${proveedor.nombre}` : '',
    proveedorEmails,
  };
}

// "ES6421002211900200204694" -> "ES****************4694" (deja el país y los
// últimos 4 dígitos, como hace el PDF que genera Business Central).
function enmascararIban(iban: string): string {
  const limpio = iban.replace(/\s/g, '');
  if (limpio.length <= 6) return limpio;
  const pais = limpio.slice(0, 2);
  const ultimos = limpio.slice(-4);
  const relleno = '*'.repeat(Math.max(limpio.length - 6, 0));
  return `${pais}${relleno}${ultimos}`;
}

// pdfkit (usado por @react-pdf/renderer) solo admite JPEG y PNG. Las fotos
// del catálogo pueden estar en cualquier formato (WebP, HEIC...), así que se
// descargan y se convierten siempre a PNG antes de incrustarlas en el PDF.
// Si algo falla, se omite la foto en vez de romper todo el documento.
async function prepararImagenParaPdf(url: string): Promise<string | undefined> {
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) return undefined;
    const buffer = Buffer.from(await respuesta.arrayBuffer());
    const png = await sharp(buffer).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return undefined;
  }
}
