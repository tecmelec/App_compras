-- El Nº de pedido Tecmelec pasa a asignarse por artículo, no por pedido completo
alter table public.pedido_items add column numero_tecmelec text;

-- El comprador necesita poder actualizar las líneas de los pedidos que tiene asignados
create policy "comprador actualiza items de sus asignados" on public.pedido_items
  for update using (
    exists (select 1 from public.pedidos p where p.id = pedido_id and p.comprador_id = auth.uid())
  );
