// Visitas guiadas del asistente (fase 2). Cada paso puede llevar a una pantalla (ruta) y
// resaltar un elemento marcado con data-tour="…". Si el elemento no está visible (p. ej.
// el carrito está vacío o el menú está plegado en el móvil), el paso se muestra centrado.

export type PasoVisita = { ruta?: string; selector?: string; titulo: string; texto: string };
export type Visita = { id: string; titulo: string; roles: string[]; pasos: PasoVisita[] };

const TODOS = ['usuario', 'responsable', 'comprador', 'admin', 'integral'];

export const VISITAS: Visita[] = [
  {
    id: 'solicitud',
    titulo: 'Hacer una solicitud de material',
    roles: TODOS,
    pasos: [
      {
        ruta: '/tienda',
        selector: '[data-tour="buscador"]',
        titulo: 'Busca el material',
        texto: 'Escribe aquí la referencia, el nombre o la categoría del artículo. Los favoritos (♡) salen siempre primero.',
      },
      {
        ruta: '/tienda',
        selector: '[data-tour="anadir"]',
        titulo: 'Añádelo al carrito',
        texto: 'Indica la cantidad con − y + (o escríbela) y pulsa "Añadir". Si el artículo tiene "Múltiplo de", la cantidad debe ser múltiplo de ese número.',
      },
      {
        ruta: '/tienda',
        selector: '[data-tour="carrito"]',
        titulo: 'Tu carrito',
        texto: 'Aquí ves cuántos artículos llevas. Cuando tengas todo, entra en el carrito.',
      },
      {
        ruta: '/carrito',
        selector: '[data-tour="carrito-foto"]',
        titulo: '¿No está en la tienda?',
        texto:
          'Desde el carrito puedes pedirlo igualmente: con una foto de tu lista escrita, con una lista de texto o con referencias. Lo que la app no encuentre lo asignará el aprobador o compras.',
      },
      {
        ruta: '/carrito',
        selector: '[data-tour="comentarios"]',
        titulo: 'Comentarios al comprador (opcional)',
        texto: 'Si quieres, deja aquí observaciones para compras: marca preferida, urgencia, cómo entregarlo…',
      },
      {
        ruta: '/carrito',
        selector: '[data-tour="solicitar"]',
        titulo: 'Envía la solicitud',
        texto:
          'Pulsa "Solicitar materiales" y completa 4 pasos: 1) Proyecto, 2) dirección de entrega, 3) persona de contacto y 4) fecha requerida. Después la verás en "Mis solicitudes".',
      },
    ],
  },
  {
    id: 'carrito-foto',
    titulo: 'Crear el carrito desde una foto',
    roles: TODOS,
    pasos: [
      {
        ruta: '/carrito',
        selector: '[data-tour="carrito-foto"]',
        titulo: 'Crear carrito desde foto',
        texto: 'Si tienes la lista de materiales escrita en papel, entra aquí.',
      },
      {
        ruta: '/carrito/foto',
        selector: '[data-tour="foto-boton"]',
        titulo: 'Haz o elige la foto',
        texto: 'Haz la foto con el móvil o elige una imagen. En el ordenador también puedes pegar una captura con Ctrl+V.',
      },
      {
        ruta: '/carrito/foto',
        titulo: 'Revisa la propuesta',
        texto:
          'La app busca cada material en la tienda y te propone los artículos. Revísalos y añádelos al carrito; lo que no encuentre queda como línea de lista para que la asigne el aprobador o compras. Después envía la solicitud desde el carrito como siempre.',
      },
    ],
  },
  {
    id: 'seguimiento',
    titulo: 'Seguir una solicitud',
    roles: TODOS,
    pasos: [
      {
        ruta: '/mis-pedidos',
        selector: '[data-tour="mis-solicitudes"]',
        titulo: 'Mis solicitudes',
        texto: 'Aquí están todas tus solicitudes. Pulsa en una para ver su detalle: el progreso de cada pedido, quién la aprueba y la casilla "Seguir pedido" para recibir avisos.',
      },
      {
        ruta: '/lineas-compras',
        selector: '[data-tour="lineas-buscador"]',
        titulo: 'Líns. compras',
        texto: 'Aquí ves cada artículo pedido. Busca por Nº de solicitud (APP-…), Nº de pedido (PC…) o artículo.',
      },
      {
        ruta: '/lineas-compras',
        selector: '[data-tour="lineas-tabla"]',
        titulo: 'Qué significa cada columna',
        texto:
          '"Fecha estimada de entrega": ✓ si la ha confirmado el proveedor y ! si va con retraso. "Estado": Pendiente de recibir, Recibido parcial, Recibido o Anulado. "Fotos albaranes": pulsa "Ver albarán" para ver las fotos de la entrega.',
      },
      {
        selector: '[data-tour="avisos"]',
        titulo: 'Avisos',
        texto: 'En la campana te llegan los avisos de tus solicitudes (aprobaciones, cambios de estado, entregas). Si instalas la app en el móvil, también como notificación.',
      },
    ],
  },
  {
    id: 'aprobar',
    titulo: 'Aprobar solicitudes',
    roles: ['responsable', 'admin', 'integral'],
    pasos: [
      {
        ruta: '/responsable',
        selector: '[data-tour="solicitudes-tabla"]',
        titulo: 'Solicitudes de mi equipo',
        texto: 'Aquí tienes las solicitudes de tu equipo. Las pendientes de aprobar aparecen con la aprobación "Pendiente". Pulsa en una para revisarla.',
      },
      {
        ruta: '/responsable',
        titulo: 'Revisar y decidir',
        texto:
          'Dentro de la solicitud puedes aprobarla tal cual, cambiar cantidades, rechazar líneas, asignar el artículo a las líneas que vienen de una lista o rechazar la solicitud entera. Al aprobar, pasa a compras.',
      },
    ],
  },
  {
    id: 'comprador',
    titulo: 'Tramitar solicitudes (compras)',
    roles: ['comprador', 'admin', 'integral'],
    pasos: [
      {
        ruta: '/comprador',
        selector: '[data-tour="filtros-rapidos"]',
        titulo: 'Filtros rápidos',
        texto: 'Todas, solo las asignadas a ti, o las de ciertos usuarios u obras que sigues.',
      },
      {
        ruta: '/comprador',
        selector: '[data-tour="solicitudes-buscador"]',
        titulo: 'Buscar',
        texto: 'Busca por Nº de solicitud, Nº de pedido, solicitante u obra. Las columnas también se pueden filtrar y ordenar.',
      },
      {
        ruta: '/comprador',
        selector: '[data-tour="ver-grafico"]',
        titulo: 'Ver gráfico y Excel',
        texto: 'Gráfico de las solicitudes visibles por comprador, solicitante u obra, y exportación a Excel.',
      },
      {
        ruta: '/comprador',
        selector: '[data-tour="solicitudes-tabla"]',
        titulo: 'Abrir una solicitud',
        texto:
          'Dentro de la solicitud: "Proponer compra" (proveedor y precio propuestos), "Pedir ofertas", "Generar comparativo", "Asignar precios desde presupuesto" y, cuando esté aprobada, "+ Crear pedido en BC". Después envía el PDF al proveedor desde "Gestión de pedidos".',
      },
    ],
  },
];

export const visitasParaRol = (rol: string) => VISITAS.filter((v) => v.roles.includes(rol));
