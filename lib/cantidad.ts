// Cantidades con decimales (hasta 3, p. ej. 10,5 m de cable). Ver migración
// 20261020120000_cantidades_decimales.sql.
export const DECIMALES_CANTIDAD = 3;

export function redondearCantidad(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Acepta "10,5" o "10.5".
export function leerCantidad(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v;
  return Number(String(v ?? '').trim().replace(',', '.'));
}

export function esCantidadValida(n: number): boolean {
  return Number.isFinite(n) && n > 0 && Math.abs(n - redondearCantidad(n)) < 1e-9;
}

// ¿Es múltiplo del múltiplo de compra? (con tolerancia para decimales)
export function esMultiploDe(n: number, multiplo: number): boolean {
  const m = multiplo > 1 ? multiplo : 1;
  if (m === 1) return true;
  const k = n / m;
  return Math.abs(k - Math.round(k)) < 1e-9;
}

// Paso del campo numérico: "any" si no hay múltiplo (admite decimales).
export function pasoCantidad(multiplo: number | null | undefined): number | 'any' {
  return multiplo && multiplo > 1 ? multiplo : 'any';
}

export function formatoCantidad(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: DECIMALES_CANTIDAD });
}
