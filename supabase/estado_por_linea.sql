-- El estado también se puede asignar por línea (cada línea puede terminar
-- en un pedido de Tecmelec distinto, con su propio avance).
alter table public.pedido_items add column estado_id int not null default 1 references public.estados_pedido(id);
