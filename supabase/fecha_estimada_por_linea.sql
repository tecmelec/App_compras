-- La fecha estimada de entrega pasa a poder asignarse también por línea de artículo
alter table public.pedido_items add column fecha_estimada_entrega date;
