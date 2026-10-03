// Formatos de importes en euros.
// - Precio unitario: como en Business Central, hasta 5 decimales (mínimo 2).
// - Importes (totales, subtotales): 2 decimales.

export function formatoPrecioUnitario(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

export function formatoImporte(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
