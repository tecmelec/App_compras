-- ============================================================
-- ESQUEMA INICIAL - Tienda Tecmelec
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- 1. PERFILES (extiende auth.users de Supabase)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  email text not null,
  rol text not null check (rol in ('admin', 'usuario', 'comprador', 'responsable')),
  comprador_id uuid references public.profiles(id),   -- comprador asignado (solo aplica si rol = 'usuario')
  responsable_id uuid references public.profiles(id), -- responsable asignado (solo aplica si rol = 'usuario')
  created_at timestamptz not null default now()
);

-- Función auxiliar: obtiene el rol del usuario autenticado actual
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
  visible boolean not null default true, -- útil cuando se integre Business Central y elijas qué mostrar
  created_at timestamptz not null default now()
);

-- 3. ESTADOS DE PEDIDO (tabla editable, sin tocar código cuando definas la lista final)
-- ------------------------------------------------------------
create table public.estados_pedido (
  id serial primary key,
  nombre text not null unique,
  orden int not null
);

insert into public.estados_pedido (nombre, orden) values ('Pendiente', 1);
-- Aquí añadiremos el resto de estados cuando me pases la lista definitiva

-- 4. PEDIDOS
-- ------------------------------------------------------------
create sequence public.pedido_numero_seq start 1;

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_app text not null unique default ('APP-' || lpad(nextval('public.pedido_numero_seq')::text, 6, '0')),
  numero_tecmelec text, -- lo asigna el comprador manualmente (a futuro, vendrá de Business Central)
  usuario_id uuid not null references public.profiles(id),
  comprador_id uuid references public.profiles(id),
  responsable_id uuid references public.profiles(id),
  estado_id int not null default 1 references public.estados_pedido(id),
  fecha_estimada_entrega date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. LÍNEAS DE PEDIDO (artículos + cantidades)
-- ------------------------------------------------------------
create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad int not null check (cantidad > 0)
);

-- ============================================================
-- ROW LEVEL SECURITY (quién puede ver/editar qué)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.productos enable row level security;
alter table public.estados_pedido enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;

-- PROFILES: cada uno ve su propio perfil; admin ve/edita todos
create policy "ver propio perfil" on public.profiles
  for select using (id = auth.uid() or public.get_my_role() = 'admin');
create policy "admin gestiona perfiles" on public.profiles
  for all using (public.get_my_role() = 'admin');

-- PRODUCTOS: todos los autenticados ven los visibles; admin gestiona todo
create policy "ver productos visibles" on public.productos
  for select using (visible = true or public.get_my_role() = 'admin');
create policy "admin gestiona productos" on public.productos
  for all using (public.get_my_role() = 'admin');

-- ESTADOS: lectura para todos los autenticados; solo admin edita
create policy "ver estados" on public.estados_pedido
  for select using (auth.role() = 'authenticated');
create policy "admin gestiona estados" on public.estados_pedido
  for all using (public.get_my_role() = 'admin');

-- PEDIDOS: usuario ve/crea los suyos; comprador ve y actualiza los asignados;
-- responsable solo ve los asignados; admin todo
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
create policy "admin gestiona pedidos" on public.pedidos
  for all using (public.get_my_role() = 'admin');

-- PEDIDO_ITEMS: visible/editable según quien pueda ver el pedido padre
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
