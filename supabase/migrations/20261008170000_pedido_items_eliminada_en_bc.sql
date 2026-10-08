-- Línea de la solicitud cuyo artículo se ha borrado del pedido de compra en BC: al
-- sincronizar se deja con cantidad 0 (y la que tenía en cantidad_antes_bc), marcada
-- como eliminada en BC y con recepción "Anulado". La cantidad 0 solo se permite en
-- estas líneas.
alter table public.pedido_items add column if not exists eliminada_en_bc boolean not null default false;
alter table public.pedido_items drop constraint if exists pedido_items_cantidad_check;
alter table public.pedido_items
  add constraint pedido_items_cantidad_check check (cantidad > 0 or (cantidad = 0 and eliminada_en_bc));
