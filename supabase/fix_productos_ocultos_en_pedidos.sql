-- Antes, un producto oculto (visible=false) no se podía leer si no eras admin,
-- lo que rompía la vista de pedidos antiguos que lo incluían.
-- El nombre/precio de un producto no es información sensible, así que
-- cualquier usuario autenticado puede leerlo; "visible" solo controla
-- si aparece en el catálogo de la tienda (eso se filtra en la consulta de /tienda).
drop policy if exists "ver productos visibles" on public.productos;
create policy "ver productos" on public.productos
  for select using (auth.role() = 'authenticated');
