const estilos: Record<string, string> = {
  pendiente: 'badge-pendiente',
  parcial: 'badge-pendiente',
  anulado: 'badge-cancelado',
  cancelado: 'badge-cancelado',
  recibido: 'badge-entregado',
  entregado: 'badge-entregado',
  tramitado: 'badge-entregado',
};

// Colores propios de los estados de recepción de una línea (coincidencia exacta).
const estilosRecepcion: Record<string, string> = {
  anulado: 'badge-rec-anulado',
  'pendiente de recibir': 'badge-rec-pendiente',
  'recibido parcial': 'badge-rec-parcial',
  recibido: 'badge-rec-recibido',
  // Estado general de la solicitud
  'tramitado parcial': 'badge-tramitado-parcial',
};

export function claseBadgeEstado(estado?: string): string {
  if (!estado) return 'badge-proceso';
  const recepcion = estilosRecepcion[estado.trim().toLowerCase()];
  if (recepcion) return recepcion;
  const clave = Object.keys(estilos).find((k) => estado.toLowerCase().includes(k));
  return clave ? estilos[clave] : 'badge-proceso';
}

export default function EstadoBadge({ estado }: { estado?: string }) {
  if (!estado) return <span className="text-slate text-sm">—</span>;

  return <span className={`badge ${claseBadgeEstado(estado)}`}>{estado}</span>;
}
