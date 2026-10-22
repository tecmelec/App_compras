-- Comentarios u observaciones del solicitante para el comprador (se escriben en el
-- carrito y se muestran resaltados en el detalle de la solicitud).
alter table public.pedidos add column if not exists comentarios_comprador text;
