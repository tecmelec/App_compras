const estilos: Record<string, string> = {
  pendiente: 'badge-pendiente',
  parcial: 'badge-pendiente',
  anulado: 'badge-cancelado',
  cancelado: 'badge-cancelado',
  recibido: 'badge-entregado',
  entregado: 'badge-entregado',
  tramitado: 'badge-entregado',
};

export function claseBadgeEstado(estado?: string): string {
  if (!estado) return 'badge-proceso';
  const clave = Object.keys(estilos).find((k) => estado.toLowerCase().includes(k));
  return clave ? estilos[clave] : 'badge-proceso';
}

export default function EstadoBadge({ estado }: { estado?: string }) {
  if (!estado) return <span className="text-slate text-sm">—</span>;

  return <span className={`badge ${claseBadgeEstado(estado)}`}>{estado}</span>;
}
