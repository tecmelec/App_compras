// Guía de uso de la app de compras para el asistente (fase 1). El asistente solo
// responde con lo que hay aquí. Mantenerla al día cuando cambie algo importante.
//
// Enlaces: el asistente puede proponer botones con la sintaxis [[Texto|/ruta]], solo a
// las rutas de RUTAS_PERMITIDAS (y, en el chat, solo si el perfil puede verlas).

export const RUTAS_PERMITIDAS: { ruta: string; roles: string[] }[] = [
  { ruta: '/tienda', roles: ['usuario', 'responsable', 'comprador', 'admin'] },
  { ruta: '/carrito', roles: ['usuario', 'responsable', 'comprador', 'admin'] },
  { ruta: '/carrito/foto', roles: ['usuario', 'responsable', 'comprador', 'admin'] },
  { ruta: '/carrito/lista', roles: ['usuario', 'responsable', 'comprador', 'admin'] },
  { ruta: '/carrito/referencias', roles: ['usuario', 'responsable', 'comprador', 'admin'] },
  { ruta: '/carrito/articulos-bc', roles: ['responsable', 'comprador', 'admin'] },
  { ruta: '/mis-pedidos', roles: ['usuario', 'responsable', 'comprador', 'admin'] },
  { ruta: '/lineas-compras', roles: ['usuario', 'responsable', 'comprador', 'admin'] },
  { ruta: '/responsable', roles: ['responsable', 'admin'] },
  { ruta: '/proyectos-equipo', roles: ['responsable', 'admin'] },
  { ruta: '/alta-articulos', roles: ['responsable', 'comprador', 'admin'] },
  { ruta: '/comprador', roles: ['comprador', 'admin'] },
  { ruta: '/admin', roles: ['admin'] },
  { ruta: '/admin/pedidos', roles: ['admin'] },
];

export const GUIA_APP = `
# App de compras de Tecmelec — guía de uso

La app sirve para pedir material para las obras: el personal hace una SOLICITUD, el aprobador (jefe de obra o responsable) la aprueba si hace falta, y el equipo de compras la convierte en pedidos de compra a los proveedores en Business Central (BC).

## Perfiles
- Usuario: hace solicitudes de material para los proyectos que tiene asignados y sigue su estado. No ve documentos adjuntos ni puede asignar líneas de planificación.
- Responsable (jefe de obra / aprobador): lo mismo que el usuario para cualquier proyecto de tipo Obra abierto, y además aprueba las solicitudes de su equipo ("Solicitudes de mi equipo") y asigna proyectos a su equipo ("Proyectos de equipo").
- Comprador: tramita las solicitudes ("Solicitudes por comprar"): elige proveedor y precio, crea el pedido de compra en BC y lo envía al proveedor.
- Admin: todo lo anterior y la Administración (usuarios, productos, proyectos, configuración). Puede aprobar cualquier solicitud.

## Menú (izquierda; en el móvil, botón ☰ arriba a la izquierda)
- Tienda Tecmelec (/tienda): catálogo de artículos.
- Mis solicitudes (/mis-pedidos): las solicitudes que has hecho y su estado.
- Líns. compras (/lineas-compras): todas las líneas de compra que puedes ver, con fecha estimada de entrega, estado y fotos de albaranes.
- Solicitudes por comprar (/comprador): compradores y admin.
- Solicitudes de mi equipo (/responsable): aprobadores y admin; el número indica las pendientes de aprobar.
- Proyectos de equipo (/proyectos-equipo): responsables y admin.
- Solicitar alta de artículos (/alta-articulos): para pedir que se dé de alta en BC un artículo que no existe.
- Arriba: buscador de la tienda, campana de avisos, carrito (con el número de artículos) y tu cuenta.

## Cómo hacer una solicitud de material (lo más habitual)
1. Busca el material en la Tienda (/tienda): escribe la referencia, el nombre o la categoría en el buscador de arriba. Los favoritos (corazón ♡) salen primero.
2. Indica la cantidad y pulsa "Añadir". Algunos artículos tienen "Múltiplo de" (por ejemplo cable de 200 en 200 m): la cantidad debe ser múltiplo de ese número. Se admiten decimales (hasta 3) si el artículo no tiene múltiplo.
3. Si NO encuentras el artículo en la tienda, ve al Carrito (/carrito) y usa uno de estos botones:
   - "Crear carrito desde foto" (/carrito/foto): haces una foto a la lista de materiales escrita a mano (o pegas una captura con Ctrl+V). La app propone los artículos y tú revisas antes de añadirlos. Lo que no encuentre queda como línea de lista para que el aprobador o compras le asigne el artículo.
   - "Crear carrito desde lista" (/carrito/lista): escribes o pegas la lista (cantidad y descripción por línea).
   - "Crear carrito por REF." (/carrito/referencias): pegas referencias de fabricante o códigos.
   - "Crear desde artículos de BC" (/carrito/articulos-bc; responsables, compradores y admin): buscas en todo el catálogo de BC.
   Las solicitudes con lista (foto, lista o REF.) y las de artículos de BC siempre pasan por el aprobador.
4. En el Carrito revisa cantidades. Opcional: "Comentarios al comprador" (observaciones para compras: marca preferida, urgencia…) y, si no eres perfil usuario, "Documentos adjuntos" (comparativos, presupuestos, fichas técnicas).
5. Pulsa "Solicitar materiales". Se abre un asistente de 4 pasos:
   1) Proyecto: busca y elige la obra. Solo aparecen proyectos de tipo Obra (los de tipo Estudio no admiten solicitudes); el perfil usuario solo ve los proyectos que tiene asignados. Si el proyecto tiene varios aprobadores, eliges quién aprueba. Los perfiles no usuario pueden marcar "Asignar líneas de planificación manualmente" para elegir la tarea del proyecto de cada artículo (si no, va a la 95.01).
   2) Dirección de entrega: eliges una dirección guardada o añades una nueva.
   3) Persona de contacto: nombre y teléfono de quien recibe el material.
   4) Fecha requerida de entrega. Puedes marcar "Seguir pedido" para recibir avisos de cambios.
6. Al enviar, la solicitud aparece en "Mis solicitudes" con un número APP-… . Si necesita aprobación, le llega al aprobador; si no, pasa directamente a compras.

## Seguir una solicitud
- En "Mis solicitudes" (/mis-pedidos) pulsa en la solicitud para ver el detalle: una barra de progreso por cada pedido de compra (Solicitud enviada → Solicitud aprobada → Pedido abierto → … → Recibido) y, bajo "Solicitud aprobada", quién aprueba o aprobó (o "Automático").
- "Líns. compras" (/lineas-compras) muestra cada artículo: Nº de pedido de compra (PC…), proveedor, fecha estimada de entrega (✓ si el proveedor la ha confirmado; ! si hay retraso), estado de recepción (Pendiente de recibir, Recibido parcial, Recibido, Anulado) y "Ver albarán" cuando hay fotos del albarán. Tiene buscador, filtros y exportación a Excel.
- "Seguir pedido": marca la casilla en el detalle para recibir avisos (campana y móvil) cuando cambie el estado o la recepción.
- La campana de arriba muestra los avisos. La app se puede instalar en el móvil y recibir notificaciones.

## Aprobar solicitudes (responsables y admin)
- "Solicitudes de mi equipo" (/responsable): abre la solicitud pendiente y elige: aprobar tal cual, cambiar cantidades, rechazar líneas, asignar artículos a las líneas de lista o rechazar la solicitud. Si estás ausente, puede haber un sustituto configurado.
- El admin también puede aprobar cualquier solicitud con el botón "Revisar y aprobar".

## Compras (compradores y admin)
- "Solicitudes por comprar" (/comprador): filtros Todas / Asignadas a mí / Por usuario / Por obra, "Ver gráfico" y exportación a Excel.
- En la solicitud: elegir proveedor y precio por línea ("Últimas compras en BC" con lupa; resalta en verde las del mismo proyecto), "Proponer compra" (propone proveedor y precio con presupuestos y compras anteriores, con revisión de la IA), "Pedir ofertas" (un email por proveedor), "Generar comparativo" (Excel), "Asignar precios desde presupuesto", "+ Crear pedido en BC" (requiere la solicitud aprobada) y, en "Gestión de pedidos", enviar el PDF al proveedor, comentarios del PDF y ver la conversación.

## Visitas guiadas
- El asistente puede enseñar un proceso resaltando en pantalla cada botón, paso a paso (botón "▶" en el chat). Hay visitas para: hacer una solicitud, crear el carrito desde una foto, seguir una solicitud, aprobar (responsables) y tramitar (compras). Se avanza con "Siguiente" y se sale con la × o la tecla Esc.

## Otras dudas frecuentes
- No encuentro un artículo: prueba otras palabras o la referencia del fabricante; si no está, usa "Crear carrito desde foto/lista/REF." o pide el alta en "Solicitar alta de artículos".
- No me sale mi proyecto: el perfil usuario solo ve los proyectos asignados por su responsable (Proyectos de equipo); además solo aparecen los de tipo Obra y abiertos.
- Quiero cambiar algo de una solicitud ya enviada: contacta con tu comprador (recuadro "¿Necesitas ayuda?" → Contactar) o con tu aprobador.
`;
