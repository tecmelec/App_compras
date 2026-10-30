// Búsqueda por palabras, como en el resto de la app: cada palabra escrita debe aparecer
// en alguno de los campos, en cualquier orden, sin distinguir mayúsculas ni acentos.
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function coincideBusqueda(busqueda: string, campos: (string | null | undefined)[]): boolean {
  const palabras = normalizar(busqueda.trim()).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const texto = normalizar(campos.filter(Boolean).join(' '));
  return palabras.every((p) => texto.includes(p));
}
