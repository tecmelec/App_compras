-- Estado de recepción por línea de artículo (distinto del estado general del pedido
-- y del estado detallado de la barra de progreso). Opciones fijas.
alter table public.pedido_items add column estado_recepcion text not null default 'Pendiente de recibir'
  check (estado_recepcion in ('Pendiente de recibir', 'Recibido parcial', 'Recibido', 'Anulado'));
