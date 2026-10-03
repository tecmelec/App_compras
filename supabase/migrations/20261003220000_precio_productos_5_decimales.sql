-- Business Central maneja precios unitarios con hasta 5 decimales (p. ej.
-- 0,20503 €/m). El catálogo los guardaba con 2 (0,21), lo que descuadraba los
-- importes en cantidades grandes (10.000 m: 2.100,00 € en vez de 2.050,30 €).
-- Mismo formato que pedido_items.precio_unitario. Los totales siguen con 2.
-- Tras aplicarla hay que volver a "Sincronizar productos" desde
-- Administración → Productos para recuperar los decimales de BC.
alter table public.productos alter column precio type numeric(12,5);
