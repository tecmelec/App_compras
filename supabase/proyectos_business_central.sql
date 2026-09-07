-- ============================================================
-- PROYECTOS (desde Business Central) y asignación a usuarios
-- ============================================================

-- 1. Proyectos sincronizados desde Business Central
create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  bc_job_no text not null unique,
  descripcion text,
  estado text,
  created_at timestamptz not null default now()
);

-- 2. Asignación de proyectos a usuarios (quién puede solicitar materiales para cada proyecto)
create table public.usuario_proyectos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, proyecto_id)
);

-- 3. Vincular cada pedido con su proyecto
alter table public.pedidos add column proyecto_id uuid references public.proyectos(id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.proyectos enable row level security;
alter table public.usuario_proyectos enable row level security;

-- PROYECTOS: cualquier usuario autenticado puede leer el directorio (no es dato sensible);
-- solo el admin puede crear/editar/borrar (lo hace la sincronización con BC, vía service role).
create policy "ver proyectos" on public.proyectos
  for select using (auth.role() = 'authenticated');
create policy "admin gestiona proyectos" on public.proyectos
  for all using (public.get_my_role() = 'admin');

-- USUARIO_PROYECTOS: el usuario ve sus propias asignaciones
create policy "usuario ve sus proyectos asignados" on public.usuario_proyectos
  for select using (usuario_id = auth.uid());

-- admin gestiona todas las asignaciones
create policy "admin gestiona asignaciones" on public.usuario_proyectos
  for all using (public.get_my_role() = 'admin');

-- responsable gestiona las asignaciones de los usuarios que tiene a su cargo
create policy "responsable gestiona asignaciones de su equipo" on public.usuario_proyectos
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = usuario_id and p.responsable_id = auth.uid()
    )
  );
