-- Recordatorio automático de fecha de entrega al proveedor (un email el día laborable
-- siguiente al envío del pedido, si aún no ha indicado la fecha).
alter table public.pedido_emails add column if not exists recordatorio_enviado_en timestamptz;
alter table public.pedido_emails add column if not exists recordatorio_error text;
