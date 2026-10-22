-- Comentarios para el PDF del pedido de compra (los escribe el comprador o el admin):
--   * de encabezado, uno por pedido Tecmelec (se imprime bajo los datos del proveedor);
--   * de línea, en cada artículo (se imprime bajo la descripción).
create table if not exists public.pedido_tecmelec_comentarios (
  numero_tecmelec text primary key,
  comentario text,
  actualizado_por uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.pedido_tecmelec_comentarios enable row level security;
-- Sin políticas: solo se lee y escribe desde el servidor (service role).

alter table public.pedido_items add column if not exists comentario_pdf text;
