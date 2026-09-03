-- ============================================================
-- ESQUEMA COMPLETO - Portal Compras (Tienda Tecmelec)
-- Ejecutar UNA SOLA VEZ en el proyecto "Portal Compras" > SQL Editor
-- Este script es autosuficiente: no depende de nada de "Portal Tecmelec"
-- ============================================================

-- 1. PERFILES (extiende auth.users de Supabase)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  email text not null,
  telefono text,
  rol text not null check (rol in ('admin', 'usuario', 'comprador', 'responsable')),
  comprador_id uuid references public.profiles(id),
  responsable_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select rol from public.profiles where id = auth.uid();
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
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. ESTADOS DE PEDIDO
-- ------------------------------------------------------------
create table public.estados_pedido (
  id serial primary key,
  nombre text not null unique,
  orden int not null
);

insert into public.estados_pedido (nombre, orden) values ('Pendiente', 1);

-- 4. DIRECCIONES DE ENTREGA
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

-- 5. PEDIDOS
-- ------------------------------------------------------------
create sequence public.pedido_numero_seq start 1;

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_app text not null unique default ('APP-' || lpad(nextval('public.pedido_numero_seq')::text, 6, '0')),
  numero_tecmelec text,
  usuario_id uuid not null references public.profiles(id),
  comprador_id uuid references public.profiles(id),
  responsable_id uuid references public.profiles(id),
  estado_id int not null default 1 references public.estados_pedido(id),
  fecha_estimada_entrega date,
  nombre_contacto text,
  telefono_contacto text,
  direccion_entrega_id uuid references public.direcciones(id),
  fecha_requerida date,
  total_estimado numeric(10,2) default 0,
  requiere_aprobacion boolean not null default false,
  aprobado boolean,
  aprobado_por uuid references public.profiles(id),
  aprobado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. LÍNEAS DE PEDIDO
-- ------------------------------------------------------------
create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad int not null check (cantidad > 0)
);

-- 7. CONFIGURACIÓN GENERAL
-- ------------------------------------------------------------
create table public.configuracion (
  id int primary key default 1,
  limite_aprobacion numeric(10,2) not null default 200,
  constraint configuracion_singleton check (id = 1)
);

insert into public.configuracion (id, limite_aprobacion) values (1, 200);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.productos enable row level security;
alter table public.estados_pedido enable row level security;
alter table public.direcciones enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.configuracion enable row level security;

-- PROFILES
create policy "ver propio perfil" on public.profiles
  for select using (id = auth.uid() or public.get_my_role() = 'admin');
create policy "admin gestiona perfiles" on public.profiles
  for all using (public.get_my_role() = 'admin');
create policy "comprador ve perfiles de sus asignados" on public.profiles
  for select using (comprador_id = auth.uid());
create policy "responsable ve perfiles de sus asignados" on public.profiles
  for select using (responsable_id = auth.uid());

-- PRODUCTOS
create policy "ver productos visibles" on public.productos
  for select using (visible = true or public.get_my_role() = 'admin');
create policy "admin gestiona productos" on public.productos
  for all using (public.get_my_role() = 'admin');

-- ESTADOS
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
    exists (select 1 from public.profiles p where p.id = usuario_id and p.comprador_id = auth.uid())
  );
create policy "responsable ve direcciones de sus asignados" on public.direcciones
  for select using (
    exists (select 1 from public.profiles p where p.id = usuario_id and p.responsable_id = auth.uid())
  );

-- PEDIDOS
create policy "usuario ve sus pedidos" on public.pedidos
  for select using (usuario_id = auth.uid());
create policy "usuario crea sus pedidos" on public.pedidos
  for insert with check (usuario_id = auth.uid());
create policy "comprador ve sus asignados" on public.pedidos
  for select using (comprador_id = auth.uid());
create policy "comprador actualiza sus asignados" on public.pedidos
  for update using (comprador_id = auth.uid());
create policy "responsable ve sus asignados" on public.pedidos
  for select using (responsable_id = auth.uid());
create policy "responsable aprueba sus asignados" on public.pedidos
  for update using (responsable_id = auth.uid());
create policy "admin gestiona pedidos" on public.pedidos
  for all using (public.get_my_role() = 'admin');

-- PEDIDO_ITEMS
create policy "ver items de pedidos accesibles" on public.pedido_items
  for select using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
      and (p.usuario_id = auth.uid() or p.comprador_id = auth.uid() or p.responsable_id = auth.uid())
    ) or public.get_my_role() = 'admin'
  );
create policy "usuario crea items de su pedido" on public.pedido_items
  for insert with check (
    exists (select 1 from public.pedidos p where p.id = pedido_id and p.usuario_id = auth.uid())
  );
create policy "admin gestiona items" on public.pedido_items
  for all using (public.get_my_role() = 'admin');

-- CONFIGURACIÓN
create policy "ver configuracion" on public.configuracion
  for select using (auth.role() = 'authenticated');
create policy "admin edita configuracion" on public.configuracion
  for update using (public.get_my_role() = 'admin');
