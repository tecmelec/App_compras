import DetalleSolicitud from '@/components/DetalleSolicitud';

export default function DetallePedidoPage({ params }: { params: { id: string } }) {
  return <DetalleSolicitud id={params.id} modo="solicitante" volver={{ href: '/mis-pedidos', texto: 'Volver a mis solicitudes' }} />;
}
