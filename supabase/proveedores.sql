-- Proveedores sincronizados desde Business Central
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  bc_proveedor_no text not null unique,
  nombre text,
  created_at timestamptz not null default now()
);

alter table public.proveedores enable row level security;

-- Cualquier autenticado puede leerlos (no es dato sensible); solo el admin gestiona
create policy "ver proveedores" on public.proveedores
  for select using (auth.role() = 'authenticated');
create policy "admin gestiona proveedores" on public.proveedores
  for all using (public.get_my_role() = 'admin');

-- Vincula cada línea de pedido con el proveedor asignado por el comprador
alter table public.pedido_items add column proveedor_id uuid references public.proveedores(id);
