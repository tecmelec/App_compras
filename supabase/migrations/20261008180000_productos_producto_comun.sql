-- Nº producto común de la ficha del artículo en BC (Common_Item_No). Los artículos
-- que se publican en la tienda llevan "APP"; los dados de alta al asignar artículos
-- en solicitudes normalmente lo tienen vacío. Se rellena al sincronizar productos.
alter table public.productos add column if not exists producto_comun text;
