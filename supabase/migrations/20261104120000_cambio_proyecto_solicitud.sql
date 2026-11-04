-- Cambio de proyecto de una solicitud (a mano por admin/comprador, o detectado al
-- sincronizar con BC cuando las líneas del pedido de compra tienen otro proyecto).
-- Acceso solo desde el servidor (cliente admin): RLS activada y sin políticas.
create table if not exists public.pedido_cambios_proyecto (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  proyecto_anterior_id uuid references public.proyectos(id) on delete set null,
  proyecto_nuevo_id uuid references public.proyectos(id) on delete set null,
  job_no_anterior text,
  job_no_nuevo text,
  origen text not null check (origen in ('manual', 'bc')),
  comentario text,
  usuario_id uuid references public.profiles(id) on delete set null,
  usuario_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists pedido_cambios_proyecto_pedido_idx on public.pedido_cambios_proyecto (pedido_id, created_at);

alter table public.pedido_cambios_proyecto enable row level security;
