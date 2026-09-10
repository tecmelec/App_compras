-- Estado general del pedido (para los listados), con opciones fijas.
-- Distinto del estado por línea (pedido_items.estado_id), que sigue usando
-- la lista configurable de /admin/estados para la barra de progreso detallada.
alter table public.pedidos add column estado_general text not null default 'Pendiente de tramitar'
  check (estado_general in ('Pendiente de tramitar', 'Tramitado', 'Tramitado parcial', 'Anulado'));
