// Perfiles de la app. "integral" = responsable + comprador, pero:
//   - no se le puede elegir como comprador (no aparece en las listas de compradores);
//   - en sus solicitudes queda él mismo como comprador;
//   - como comprador solo ve y gestiona SUS solicitudes (las que crea o tiene asignadas),
//     no las de todos como el perfil comprador.
// "seguidor_ia" = cuenta de un agente que solo consulta "Líns. compras", "Solicitudes por
// comprar" y su detalle, y únicamente puede modificar la "Fecha estimada de entrega".
export type Rol = 'admin' | 'usuario' | 'comprador' | 'responsable' | 'integral' | 'seguidor_ia';

export const ROLES_COMPRAS = ['comprador', 'admin', 'integral'];
export const ROLES_APROBADOR = ['responsable', 'admin', 'integral'];
// Pantallas a las que puede entrar el Seguidor IA (el resto redirige a Líns. compras).
export const RUTAS_SEGUIDOR_IA = ['/lineas-compras', '/comprador'];

export const esCompras = (rol?: string | null) => !!rol && ROLES_COMPRAS.includes(rol);
export const esAprobador = (rol?: string | null) => !!rol && ROLES_APROBADOR.includes(rol);
export const esSeguidorIA = (rol?: string | null) => rol === 'seguidor_ia';
