export function numerosTecmelecTexto(items: { numero_tecmelec: string | null }[] | undefined | null): string {
  if (!items || items.length === 0) return '—';
  const unicos = Array.from(new Set(items.map((i) => i.numero_tecmelec).filter(Boolean))) as string[];
  return unicos.length > 0 ? unicos.join(', ') : '—';
}
