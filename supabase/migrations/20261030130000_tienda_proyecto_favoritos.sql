-- Tienda por proyecto: proyectos favoritos de cada usuario (acceso rápido).
-- Acceso solo desde el servidor (cliente admin): RLS activada y sin políticas.
create table if not exists public.tienda_proyecto_favoritos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, proyecto_id)
);

alter table public.tienda_proyecto_favoritos enable row level security;
