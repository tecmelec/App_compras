-- Tienda por proyecto: las ampliaciones pueden ser negativas (reducir lo autorizado), así
-- que la suma de ampliaciones puede quedar por debajo de 0. El límite total
-- (cantidad_maxima + cantidad_ampliada) se valida en el servidor (debe ser mayor que 0).
alter table public.tienda_proyecto_articulos drop constraint if exists tienda_proyecto_articulos_cantidad_ampliada_check;
