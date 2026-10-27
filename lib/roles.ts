// Perfiles de la app. "integral" = responsable + comprador, pero:
//   - no se le puede elegir como comprador (no aparece en las listas de compradores);
//   - en sus solicitudes queda él mismo como comprador;
//   - como comprador solo ve y gestiona SUS solicitudes (las que crea o tiene asignadas),
//     no las de todos como el perfil comprador.
export type Rol = 'admin' | 'usuario' | 'comprador' | 'responsable' | 'integral';

export const ROLES_COMPRAS = ['comprador', 'admin', 'integral'];
export const ROLES_APROBADOR = ['responsable', 'admin', 'integral'];

export const esCompras = (rol?: string | null) => !!rol && ROLES_COMPRAS.includes(rol);
export const esAprobador = (rol?: string | null) => !!rol && ROLES_APROBADOR.includes(rol);
