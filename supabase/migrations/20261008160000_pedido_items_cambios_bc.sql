-- Cambios hechos directamente en el pedido de compra de BC, recogidos al sincronizar:
--  - cantidad_antes_bc: cantidad que tenía la línea en la app antes de que se cambiara
--    en BC (null si BC no la ha cambiado). BC manda en la cantidad una vez vinculada.
--  - anadida_en_bc: línea que no se pidió desde la app; se añadió en el pedido de BC
--    y la sincronización la incorporó a la solicitud.
alter table public.pedido_items add column if not exists cantidad_antes_bc integer;
alter table public.pedido_items add column if not exists anadida_en_bc boolean not null default false;
