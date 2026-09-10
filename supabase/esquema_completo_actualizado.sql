-- ============================================================
-- ESQUEMA COMPLETO — Tienda Tecmelec (estado actual, para un
-- proyecto de Supabase NUEVO y VACÍO, ej. un sandbox de desarrollo).
-- Ejecutar de una sola vez en el SQL Editor.
-- ============================================================

-- 1. PERFILES
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  email text not null,
  telefono text,
  rol text not null check (rol in ('admin', 'usuario', 'comprador', 'responsable')),
  comprador_id uuid references public.profiles(id),
  responsable_id uuid references public.profiles(id),
  sustituto_id uuid references public.profiles(id),
  sustituto_activo boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select rol from public.profiles where id = auth.uid();
$$;

create or replace function public.es_sustituto_de(target_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = target_id and sustituto_id = auth.uid() and sustituto_activo = true
  );
$$;

-- 2. PRODUCTOS
-- ------------------------------------------------------------
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  imagen_url text,
  categoria text,
  precio numeric(10,2) not null default 0,
  unidad_medida text,
  bc_item_no text unique,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. ESTADOS DE PEDIDO (para la barra de progreso detallada por línea)
-- ------------------------------------------------------------
create table public.estados_pedido (
  id serial primary key,
  nombre text not null unique,
  orden int not null
);

insert into public.estados_pedido (nombre, orden) values ('Pendiente', 1);

create or replace function public.resolver_sustituto(id uuid)
returns uuid language sql security definer stable as $$
  select coalesce(
    (select sustituto_id from public.profiles
     where id = $1 and sustituto_activo = true and sustituto_id is not null),
    id
  );
$$;

-- 4. DIRECCIONES
-- ------------------------------------------------------------
create table public.direcciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  alias text not null,
  direccion text not null,
  codigo_postal text,
  ciudad text,
  provincia text,
  created_at timestamptz not null default now()
);

-- 5. PROYECTOS (Business Central)
-- ------------------------------------------------------------
create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  bc_job_no text not null unique,
  descripcion text,
  estado text,
  direccion text,
  codigo_postal text,
  ciudad text,
  provincia text,
  created_at timestamptz not null default now()
);

create table public.usuario_proyectos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, proyecto_id)
);

-- 6. PROVEEDORES (Business Central)
-- ------------------------------------------------------------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  bc_proveedor_no text not null unique,
  nombre text,
  created_at timestamptz not null default now()
);

-- 7. CONFIGURACIÓN GENERAL
-- ------------------------------------------------------------
create table public.configuracion (
  id int primary key default 1,
  limite_aprobacion numeric(10,2) not null default 200,
  constraint configuracion_singleton check (id = 1)
);

insert into public.configuracion (id, limite_aprobacion) values (1, 200);

-- 8. PEDIDOS
-- ------------------------------------------------------------
create sequence public.pedido_numero_seq start 1;

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_app text not null unique default ('APP-' || lpad(nextval('public.pedido_numero_seq')::text, 6, '0')),
  usuario_id uuid not null references public.profiles(id),
  comprador_id uuid references public.profiles(id),
  responsable_id uuid references public.profiles(id),
  proyecto_id uuid references public.proyectos(id),
  direccion_entrega_id uuid references public.direcciones(id),
  nombre_contacto text,
  telefono_contacto text,
  fecha_requerida date,
  fecha_estimada_entrega date,
  total_estimado numeric(10,2) default 0,
  requiere_aprobacion boolean not null default false,
  aprobado boolean,
  aprobado_por uuid references public.profiles(id),
  aprobado_en timestamptz,
  estado_general text not null default 'Pendiente de tramitar'
    check (estado_general in ('Pendiente de tramitar', 'Tramitado', 'Tramitado parcial', 'Anulado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 9. LÍNEAS DE PEDIDO
-- ------------------------------------------------------------
create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad int not null check (cantidad > 0),
  numero_tecmelec text,
  fecha_estimada_entrega date,
  estado_id int references public.estados_pedido(id),
  estado_recepcion text not null default 'Pendiente de recibir'
    check (estado_recepcion in ('Pendiente de recibir', 'Recibido parcial', 'Recibido', 'Anulado')),
  proveedor_id uuid references public.proveedores(id)
);

alter table public.pedido_items
  alter column estado_id set default (select id from public.estados_pedido order by orden limit 1);

update public.pedido_items
  set estado_id = (select id from public.estados_pedido order by orden limit 1)
  where estado_id is null;

-- 10. FAVORITOS
-- ------------------------------------------------------------
create table public.favoritos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, producto_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.productos enable row level security;
alter table public.estados_pedido enable row level security;
alter table public.direcciones enable row level security;
alter table public.proyectos enable row level security;
alter table public.usuario_proyectos enable row level security;
alter table public.proveedores enable row level security;
alter table public.configuracion enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.favoritos enable row level security;

-- PROFILES
create policy "ver propio perfil" on public.profiles
  for select using (id = auth.uid() or public.get_my_role() = 'admin');
create policy "admin gestiona perfiles" on public.profiles
  for all using (public.get_my_role() = 'admin');
create policy "comprador ve perfiles de sus asignados" on public.profiles
  for select using (comprador_id = auth.uid() or public.es_sustituto_de(comprador_id));
create policy "responsable ve perfiles de sus asignados" on public.profiles
  for select using (responsable_id = auth.uid() or public.es_sustituto_de(responsable_id));
create policy "responsable ve lista de compradores" on public.profiles
  for select using (rol = 'comprador' and public.get_my_role() = 'responsable');

-- PRODUCTOS (nombre/precio no es sensible; "visible" solo filtra el catálogo de la tienda)
create policy "ver productos" on public.productos
  for select using (auth.role() = 'authenticated');
create policy "admin gestiona productos" on public.productos
  for all using (public.get_my_role() = 'admin');

-- ESTADOS_PEDIDO
create policy "ver estados" on public.estados_pedido
  for select using (auth.role() = 'authenticated');
create policy "admin gestiona estados" on public.estados_pedido
  for all using (public.get_my_role() = 'admin');

-- DIRECCIONES
create policy "usuario ve sus direcciones" on public.direcciones
  for select using (usuario_id = auth.uid());
create policy "usuario crea sus direcciones" on public.direcciones
  for insert with check (usuario_id = auth.uid());
create policy "usuario edita sus direcciones" on public.direcciones
  for update using (usuario_id = auth.uid());
create policy "usuario borra sus direcciones" on public.direcciones
  for delete using (usuario_id = auth.uid());
create policy "admin gestiona direcciones" on public.direcciones
  for all using (public.get_my_role() = 'admin');
create policy "comprador ve direcciones de sus asignados" on public.direcciones
  for select using (
    exists (select 1 from public.profiles p where p.id = usuario_id
      and (p.comprador_id = auth.uid() or public.es_sustituto_de(p.comprador_id)))
  );
create policy "responsable ve direcciones de sus asignados" on public.direcciones
  for select using (
    exists (select 1 from public.profiles p where p.id = usuario_id
      and (p.responsable_id = auth.uid() or public.es_sustituto_de(p.responsable_id)))
  );

-- PROYECTOS (directorio no sensible)
create policy "ver proyectos" on public.proyectos
  for select using (auth.role() = 'authenticated');
create policy "admin gestiona proyectos" on public.proyectos
  for all using (public.get_my_role() = 'admin');

-- USUARIO_PROYECTOS
create policy "usuario ve sus proyectos asignados" on public.usuario_proyectos
  for select using (usuario_id = auth.uid());
create policy "admin gestiona asignaciones" on public.usuario_proyectos
  for all using (public.get_my_role() = 'admin');
create policy "responsable gestiona asignaciones de su equipo" on public.usuario_proyectos
  for all using (
    exists (select 1 from public.profiles p where p.id = usuario_id and p.responsable_id = auth.uid())
  );

-- PROVEEDORES (directorio no sensible)
create policy "ver proveedores" on public.proveedores
  for select using (auth.role() = 'authenticated');
create policy "admin gestiona proveedores" on public.proveedores
  for all using (public.get_my_role() = 'admin');

-- CONFIGURACIÓN
create policy "ver configuracion" on public.configuracion
  for select using (auth.role() = 'authenticated');
create policy "admin edita configuracion" on public.configuracion
  for update using (public.get_my_role() = 'admin');

-- PEDIDOS
create policy "usuario ve sus pedidos" on public.pedidos
  for select using (usuario_id = auth.uid());
create policy "usuario crea sus pedidos" on public.pedidos
  for insert with check (usuario_id = auth.uid());
create policy "comprador ve sus asignados" on public.pedidos
  for select using (comprador_id = auth.uid() or public.es_sustituto_de(comprador_id));
create policy "comprador actualiza sus asignados" on public.pedidos
  for update using (comprador_id = auth.uid() or public.es_sustituto_de(comprador_id));
create policy "responsable ve sus asignados" on public.pedidos
  for select using (responsable_id = auth.uid() or public.es_sustituto_de(responsable_id));
create policy "responsable aprueba sus asignados" on public.pedidos
  for update using (responsable_id = auth.uid() or public.es_sustituto_de(responsable_id));
create policy "admin gestiona pedidos" on public.pedidos
  for all using (public.get_my_role() = 'admin');

-- PEDIDO_ITEMS
create policy "ver items de pedidos accesibles" on public.pedido_items
  for select using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
      and (
        p.usuario_id = auth.uid()
        or p.comprador_id = auth.uid() or public.es_sustituto_de(p.comprador_id)
        or p.responsable_id = auth.uid() or public.es_sustituto_de(p.responsable_id)
      )
    ) or public.get_my_role() = 'admin'
  );
create policy "usuario crea items de su pedido" on public.pedido_items
  for insert with check (
    exists (select 1 from public.pedidos p where p.id = pedido_id and p.usuario_id = auth.uid())
  );
create policy "comprador actualiza items de sus asignados" on public.pedido_items
  for update using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
      and (p.comprador_id = auth.uid() or public.es_sustituto_de(p.comprador_id))
    )
  );
create policy "admin gestiona items" on public.pedido_items
  for all using (public.get_my_role() = 'admin');

-- FAVORITOS
create policy "usuario gestiona sus favoritos" on public.favoritos
  for all using (usuario_id = auth.uid());
create policy "admin ve todos los favoritos" on public.favoritos
  for select using (public.get_my_role() = 'admin');
