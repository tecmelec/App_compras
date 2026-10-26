// ¿La referencia que pone el proveedor en su oferta aparece en la descripción de nuestro
// artículo de BC? (p. ej. "SIMON REF: 4400472-030 Base de enchufe…" contiene la
// referencia 4400472-030 de la oferta). Nunca coincide con nuestro código de BC.
const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function referenciaEnDescripcion(referencia: string | null | undefined, descripcion: string | null | undefined): boolean {
  const ref = alnum(referencia || '');
  // Referencias muy cortas o sin números darían falsos positivos.
  if (ref.length < 5 || !/\d/.test(ref)) return false;
  const texto = (descripcion || '').toUpperCase();
  // 1) Como "palabra" de la descripción (separada por espacios o signos).
  const palabras = texto.split(/[\s,;:()\[\]"'+]+/).map(alnum).filter(Boolean);
  if (palabras.includes(ref)) return true;
  // 2) Dentro del texto sin separadores, solo si es larga (evita "12345" en "123456").
  return ref.length >= 8 && alnum(texto).includes(ref);
}
