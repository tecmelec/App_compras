// Tipos y utilidades del carrito desde foto que se usan también en el navegador
// (sin dependencias de servidor).

export type CandidatoLista = {
  id: string;
  nombre: string;
  bc_item_no: string | null;
  unidad_medida: string | null;
  multiplo_compra: number;
  imagen_url: string | null;
};

export type LineaLista = {
  n: number;
  texto: string; // lo que pone en el papel
  cantidad_escrita: number | null;
  unidad_escrita: string | null;
  // Propuesta del análisis
  producto_propuesto_id: string | null;
  cantidad_producto: number | null; // cantidad escrita pasada a la unidad del producto
  cantidad_propuesta: number | null; // ajustada al múltiplo de compra
  confianza: 'alta' | 'media' | 'baja' | null;
  nota: string | null;
  candidatos: CandidatoLista[];
  // Decisión del usuario al añadir al carrito
  producto_id?: string | null;
  cantidad_carrito?: number | null;
};

// --- Redondeo al múltiplo -----------------------------------------------------------

export function ajustarAMultiplo(cantidad: number | null, multiplo: number): number | null {
  if (cantidad == null || !Number.isFinite(cantidad) || cantidad <= 0) return null;
  const m = multiplo > 1 ? multiplo : 1;
  return Math.max(m, Math.ceil(cantidad / m - 1e-9) * m);
}

