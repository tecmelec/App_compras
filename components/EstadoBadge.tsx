const estilos: Record<string, string> = {
  pendiente: 'badge-pendiente',
  parcial: 'badge-pendiente',
  anulado: 'badge-cancelado',
  cancelado: 'badge-cancelado',
  entregado: 'badge-entregado',
  tramitado: 'badge-entregado',
};

export default function EstadoBadge({ estado }: { estado?: string }) {
  if (!estado) return <span className="text-slate text-sm">—</span>;

  const clave = Object.keys(estilos).find((k) => estado.toLowerCase().includes(k));
  const clase = clave ? estilos[clave] : 'badge-proceso';

  return <span className={`badge ${clase}`}>{estado}</span>;
}
