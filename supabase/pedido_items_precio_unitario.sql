-- Precio unitario propio de cada línea de pedido. Mientras no tenga Nº pedido
-- Tecmelec, el comprador lo gestiona a mano (por defecto, el precio del
-- catálogo); en cuanto se sincroniza con Business Central, se recalcula como
-- Line_Amount / Quantity (así recoge descuentos de línea) y BC pasa a mandar.
alter table public.pedido_items
  add column if not exists precio_unitario numeric(12,5);
