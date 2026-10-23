-- Condiciones comerciales por proveedor (Administración → Condiciones comerciales):
-- % de pronto pago y % de rappel que se aplican al generar el comparativo de ofertas.
create table if not exists public.condiciones_proveedor (
  proveedor_id uuid primary key references public.proveedores(id) on delete cascade,
  pronto_pago_pct numeric not null default 0,
  rappel_pct numeric not null default 0,
  notas text,
  actualizado_por uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.condiciones_proveedor enable row level security;
-- Sin políticas: solo se lee y escribe desde el servidor (service role).
