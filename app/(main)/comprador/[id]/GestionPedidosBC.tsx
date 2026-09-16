type Fila = {
  numeroTecmelec: string;
  proveedorNombre: string;
  total: number;
  lineas: number;
};

export default function GestionPedidosBC({ pedidos }: { pedidos: Fila[] }) {
  if (pedidos.length === 0) return null;

  return (
    <div className="bg-white border border-borde rounded-xl p-6 mb-6">
      <h2 className="text-sm font-semibold text-grafito mb-3">Gestión de pedidos</h2>
      <div className="divide-y divide-borde">
        {pedidos.map((p) => (
          <div key={p.numeroTecmelec} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div>
              <p className="text-sm font-mono text-grafito">{p.numeroTecmelec}</p>
              <p className="text-xs text-slate">
                {p.proveedorNombre || 'Proveedor sin asignar'} · {p.lineas} {p.lineas === 1 ? 'línea' : 'líneas'} ·{' '}
                {p.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <a
                href={`/api/pedidos/${encodeURIComponent(p.numeroTecmelec)}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-marca hover:underline"
              >
                Ver PDF
              </a>
              <a
                href={`/api/pedidos/${encodeURIComponent(p.numeroTecmelec)}/pdf?fotos=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-marca hover:underline"
              >
                PDF con fotos
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
