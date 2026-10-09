// Texto de quién rechazó una línea de solicitud. Si no hay datos, la rechazó el
// aprobador al aprobar con cambios.
export function quienRechazo(rol: string | null | undefined, nombre: string | null | undefined): string {
  if (rol === 'comprador' || rol === 'admin') return nombre ? `Compras (${nombre})` : 'Compras';
  if (rol === 'responsable') return nombre ? `el responsable (${nombre})` : 'el responsable';
  return 'el aprobador';
}
