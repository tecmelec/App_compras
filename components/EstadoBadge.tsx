const estilos: Record<string, string> = {
  pendiente: 'badge-pendiente',
  entregado: 'badge-entregado',
  cancelado: 'badge-cancelado',
};

export default function EstadoBadge({ estado }: { estado?: string }) {
  if (!estado) return <span className="text-slate text-sm">—</span>;

  const clave = Object.keys(estilos).find((k) => estado.toLowerCase().includes(k));
  const clase = clave ? estilos[clave] : 'badge-proceso';

  return <span className={`badge ${clase}`}>{estado}</span>;
}
