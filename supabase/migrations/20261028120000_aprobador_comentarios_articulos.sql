-- El aprobador, antes de aprobar, puede dejar comentarios al comprador, adjuntar
-- documentos y añadir artículos a la solicitud.
alter table public.pedidos add column if not exists comentarios_aprobador text;
alter table public.pedidos add column if not exists comentarios_aprobador_por text;
alter table public.pedido_items add column if not exists anadida_por_aprobador boolean not null default false;
