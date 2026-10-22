-- Comprador IA — Fase 1 (paso 1): propuesta de compra por reglas (sin IA).
-- Parámetros editables en Administración → Configuración.
alter table public.configuracion add column if not exists propuesta_dias_presupuesto integer not null default 90;
alter table public.configuracion add column if not exists propuesta_meses_compras integer not null default 6;
alter table public.configuracion add column if not exists propuesta_pct_agrupar numeric not null default 5;
alter table public.configuracion add column if not exists propuesta_pct_variacion numeric not null default 10;

-- Cada propuesta calculada y lo que hizo el comprador con ella (para medir el acierto).
create table if not exists public.propuestas_compra (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  creado_por uuid references public.profiles(id),
  parametros jsonb not null default '{}'::jsonb,
  lineas jsonb not null default '[]'::jsonb,
  resultado jsonb,
  aplicado_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists propuestas_compra_pedido_id_idx on public.propuestas_compra (pedido_id);
alter table public.propuestas_compra enable row level security;
-- Sin políticas: solo se lee y escribe desde el servidor (service role).

-- Línea cuyo proveedor/precio se aplicó desde una propuesta ("Propuesta automática";
-- se vacía si el comprador cambia el precio a mano).
alter table public.pedido_items
  add column if not exists propuesta_compra_id uuid references public.propuestas_compra(id) on delete set null;
