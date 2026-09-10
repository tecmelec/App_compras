-- Igual que antes, pero sin asumir que existe un estado con id = 1
-- (usa el primero según el campo "orden", cualquiera que sea su id real).
alter table public.pedido_items
  add column estado_id int references public.estados_pedido(id);

update public.pedido_items
set estado_id = (select id from public.estados_pedido order by orden limit 1)
where estado_id is null;

alter table public.pedido_items
  alter column estado_id set not null,
  alter column estado_id set default (select id from public.estados_pedido order by orden limit 1);
