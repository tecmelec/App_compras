import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { EMPRESA } from './empresa';
import { LOGO_TECMELEC_BASE64 } from './logo';

function euros(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, color: '#1a1a1a', fontFamily: 'Helvetica' },
  logo: { width: 130, height: 130 / (829 / 101) },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  tituloDocumento: { fontSize: 13, fontWeight: 700, textAlign: 'right' },
  fechaDocumento: { fontSize: 9, color: '#444', textAlign: 'right', marginTop: 2 },
  empresaLinea: { fontSize: 9, marginBottom: 14 },
  bloquesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  bloque: { width: '48%', backgroundColor: '#ececec', padding: 8, borderRadius: 2 },
  bloqueTitulo: { fontSize: 9, color: '#178A4C', marginBottom: 4 },
  bloqueTexto: { fontSize: 9, lineHeight: 1.4 },
  bloqueNombre: { fontSize: 9, fontWeight: 700, marginBottom: 1 },
  tabla: { marginTop: 4 },
  filaCabecera: {
    flexDirection: 'row',
    backgroundColor: '#ececec',
    paddingVertical: 5,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  fila: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  colNo: { width: '13%' },
  colDesc: { width: '39%' },
  colCant: { width: '12%', textAlign: 'right' },
  colUd: { width: '8%', textAlign: 'left', paddingLeft: 4 },
  colPrecio: { width: '10%', textAlign: 'right' },
  colDto: { width: '8%', textAlign: 'right' },
  colImporte: { width: '10%', textAlign: 'right' },
  cabeceraTexto: { fontSize: 9, fontWeight: 700 },
  totales: { marginTop: 12, alignSelf: 'flex-end', width: '45%' },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalFilaFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: '#ececec',
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 2,
    fontWeight: 700,
  },
  condiciones: { marginTop: 28, fontSize: 6, color: '#333', textAlign: 'center', lineHeight: 1.5 },
  pagoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#666',
    textAlign: 'center',
    lineHeight: 1.4,
  },
});

const CONDICIONES = `CONDICIONES PEDIDO DE COMPRA:
Deben indicar el nº de pedido Tecmelec en sus albaranes y facturas
El presente pedido contempla la posibilidad de devolución de cualquier tipo de material de forma individual, total o parcial sin que ello suponga sobrecargo o penalización alguna. Asimismo, el proveedor se compromete a la recogida de dicho material en cualquier obra, almacén o punto definido. Será responsabilidad del proveedor la entrega in situ, quedando encargado de ubicar los materiales en obra salvo cambio pactado por ambas partes. De la misma forma será responsable del correcto estado del material hasta la recepción del mismo por parte de TECMELEC ELECTRICIDAD S.L.
Los costes de entrega y posible recogida de todo tipo de material correrán a cargo del proveedor. Los plazos de entrega han de ser respetados. Se entiende por entrega inmediata la entrega en el próximo día laborable a la realización del pedido. Cualquiera de las anteriores condiciones que por determinadas circunstancias no puedan ser cumplida por el proveedor ha de informarse de forma inmediata al solicitante del pedido por vía email. En caso contrario se considerará que el pedido ha sido cursado correctamente. Los precios descritos en el presente documento no contemplan bajo ningún concepto descuentos derivados de condiciones de pago o volumen, tales como Dtos P.P., Rappel...
Las condiciones antes mencionadas son las únicas validas, quedando sin efecto las indicadas en cualquier otro documento, salvo acuerdo por escrito y firmado por ambas partes.`;

export type LineaPdf = {
  bcItemNo: string;
  nombre: string;
  cantidad: number;
  unidadMedida: string;
  precio: number;
};

export type PedidoCompraPdfProps = {
  numeroTecmelec: string;
  fechaEmision: string; // ya formateada dd/mm/aaaa
  proveedorNombre: string;
  proveedorDireccion: string; // ya compuesta en una línea (o vacío)
  proveedorCif: string;
  contacto: string;
  direccionEnvio: string; // ya compuesta en una línea
  lineas: LineaPdf[];
};

export default function PedidoCompraDocument({
  numeroTecmelec,
  fechaEmision,
  proveedorNombre,
  proveedorDireccion,
  proveedorCif,
  contacto,
  direccionEnvio,
  lineas,
}: PedidoCompraPdfProps) {
  const base = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
  const iva = base * (EMPRESA.ivaPorcentaje / 100);
  const total = base + iva;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Image style={styles.logo} src={LOGO_TECMELEC_BASE64} />
          <View>
            <Text style={styles.tituloDocumento}>Pedido de compra {numeroTecmelec}</Text>
            <Text style={styles.fechaDocumento}>Fecha emisión documento: {fechaEmision}</Text>
          </View>
        </View>

        <Text style={styles.empresaLinea}>
          {EMPRESA.nombre}  CIF/NIF: {EMPRESA.cif}
        </Text>

        <View style={styles.bloquesRow}>
          <View style={styles.bloque}>
            <Text style={styles.bloqueTitulo}>Proveedor</Text>
            <Text style={styles.bloqueNombre}>{proveedorNombre}</Text>
            {proveedorDireccion ? <Text style={styles.bloqueTexto}>{proveedorDireccion}</Text> : null}
            {proveedorCif ? <Text style={styles.bloqueTexto}>CIF/NIF: {proveedorCif}</Text> : null}
          </View>
          <View style={styles.bloque}>
            <Text style={styles.bloqueTitulo}>Dirección envío</Text>
            {contacto ? <Text style={styles.bloqueTexto}>{contacto}</Text> : null}
            <Text style={styles.bloqueTexto}>{direccionEnvio}</Text>
          </View>
        </View>

        <View style={styles.tabla}>
          <View style={styles.filaCabecera}>
            <Text style={[styles.colNo, styles.cabeceraTexto]}>Nº</Text>
            <Text style={[styles.colDesc, styles.cabeceraTexto]}>Descripción</Text>
            <Text style={[styles.colCant, styles.cabeceraTexto]}>Cantidad</Text>
            <Text style={[styles.colUd, styles.cabeceraTexto]}></Text>
            <Text style={[styles.colPrecio, styles.cabeceraTexto]}>Precio</Text>
            <Text style={[styles.colDto, styles.cabeceraTexto]}>% Dto.</Text>
            <Text style={[styles.colImporte, styles.cabeceraTexto]}>Importe</Text>
          </View>
          {lineas.map((l, i) => (
            <View style={styles.fila} key={i}>
              <Text style={styles.colNo}>{l.bcItemNo}</Text>
              <Text style={styles.colDesc}>{l.nombre}</Text>
              <Text style={styles.colCant}>{euros(l.cantidad)}</Text>
              <Text style={styles.colUd}>{l.unidadMedida}</Text>
              <Text style={styles.colPrecio}>{euros(l.precio)}</Text>
              <Text style={styles.colDto}></Text>
              <Text style={styles.colImporte}>{euros(l.cantidad * l.precio)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totales}>
          <View style={styles.totalFila}>
            <Text>Base imponible</Text>
            <Text>{euros(base)}</Text>
          </View>
          <View style={styles.totalFila}>
            <Text>Importe IVA+RE ({EMPRESA.ivaPorcentaje}%)</Text>
            <Text>{euros(iva)}</Text>
          </View>
          <View style={styles.totalFilaFinal}>
            <Text>Total EUR IVA+RE incl.</Text>
            <Text>{euros(total)}</Text>
          </View>
        </View>

        <Text style={styles.condiciones}>{CONDICIONES}</Text>

        <View style={styles.pagoRow}>
          <Text>Forma de pago: {EMPRESA.formaPago}</Text>
          <Text>IBAN: {EMPRESA.ibanEnmascarado}</Text>
        </View>

        <Text style={styles.footer}>
          {EMPRESA.registroMercantil}
          {'\n'}
          {EMPRESA.direccion}. Tel. {EMPRESA.telefono}. e-mail:{EMPRESA.email}
        </Text>
      </Page>
    </Document>
  );
}
