-- Visibilidad ampliada en "Líns. compras" para perfiles usuario y responsable
-- (Administración → Usuarios). Por defecto el usuario ve las líneas de sus proyectos
-- habilitados y el responsable las de las solicitudes que aprueba. El admin puede:
--   * dejarle ver las líneas de TODOS los proyectos (profiles.lineas_compras_todos), o
--   * dejarle ver además proyectos concretos (usuario_proyectos_consulta).
-- Es solo consulta: no habilita esos proyectos para solicitar materiales.
-- La escritura se hace desde el servidor con la service role tras comprobar que es admin.
alter table public.profiles add column if not exists lineas_compras_todos boolean not null default false;

create table if not exists public.usuario_proyectos_consulta (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, proyecto_id)
);
create index if not exists usuario_proyectos_consulta_proyecto_id_idx on public.usuario_proyectos_consulta (proyecto_id);

alter table public.usuario_proyectos_consulta enable row level security;
drop policy if exists "usuario ve sus proyectos de consulta" on public.usuario_proyectos_consulta;
create policy "usuario ve sus proyectos de consulta" on public.usuario_proyectos_consulta
  as permissive for select to public
  using (usuario_id = auth.uid());
