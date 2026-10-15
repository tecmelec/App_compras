-- Aprobadores adicionales por proyecto. En BC cada proyecto tiene un solo jefe de obra;
-- aquí el administrador puede asignar varios responsables a un proyecto. Si un proyecto
-- tiene aprobadores asignados, al pedir material para él el solicitante elige quién
-- aprueba la solicitud. Se lee y escribe desde el servidor (service role).
create table if not exists public.proyecto_aprobadores (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (proyecto_id, usuario_id)
);
create index if not exists proyecto_aprobadores_proyecto_idx on public.proyecto_aprobadores (proyecto_id);
alter table public.proyecto_aprobadores enable row level security;
