-- Los artículos asignados desde la lista en foto se crean ocultos (visible = false)
-- para que no salgan en la tienda. Con la política anterior solo el admin podía
-- leerlos, así que en las solicitudes salían como "Producto no disponible" y la
-- creación del pedido de compra en BC no encontraba su código (bc_item_no).
--
-- Esta política deja leer un producto oculto a quien pueda ver alguna línea de
-- solicitud que lo use (se aplica la RLS de pedido_items). La tienda no cambia:
-- su consulta filtra visible = true explícitamente.

drop policy if exists "ver productos de solicitudes accesibles" on public.productos;
create policy "ver productos de solicitudes accesibles" on public.productos
  as permissive for select to public
  using (exists (select 1 from public.pedido_items pi where pi.producto_id = productos.id));
