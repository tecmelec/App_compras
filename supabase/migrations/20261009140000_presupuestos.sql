-- Presupuestos de proveedor adjuntados a una solicitud para asignar precios (vista
-- del comprador): archivos (PDF o fotos) en el bucket "listas-foto", proveedor
-- identificado, líneas leídas (referencia, descripción, cantidad, precio neto) y las
-- asignaciones aplicadas a las líneas de la solicitud. Se lee y escribe desde el
-- servidor con la service role (las páginas comprueban antes el acceso).
create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  archivos text[] not null default '{}',
  nombres_archivo text[] not null default '{}',
  proveedor jsonb,
  lineas jsonb not null default '[]'::jsonb,
  asignaciones jsonb not null default '[]'::jsonb,
  creado_por uuid references public.profiles(id),
  aplicado_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists presupuestos_pedido_id_idx on public.presupuestos (pedido_id);
alter table public.presupuestos enable row level security;

-- Línea cuyo precio viene de un presupuesto (se vacía si el comprador cambia el precio a mano).
alter table public.pedido_items
  add column if not exists precio_presupuesto_id uuid references public.presupuestos(id) on delete set null;
