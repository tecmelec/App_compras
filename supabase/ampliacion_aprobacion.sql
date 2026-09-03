-- ============================================================
-- AMPLIACIÓN: contacto, direcciones, precios y aprobación por monto
-- ============================================================

-- 1. Teléfono en el perfil (para precargar el dato de contacto)
alter table public.profiles add column telefono text;

-- 2. Direcciones de entrega (cada usuario arma su propio listado)
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

alter table public.direcciones enable row level security;

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
-- comprador y responsable necesitan leer la dirección de los pedidos que gestionan
create policy "comprador ve direcciones de sus asignados" on public.direcciones
  for select using (
    exists (select 1 from public.profiles p where p.id = usuario_id and p.comprador_id = auth.uid())
  );
create policy "responsable ve direcciones de sus asignados" on public.direcciones
  for select using (
    exists (select 1 from public.profiles p where p.id = usuario_id and p.responsable_id = auth.uid())
  );

-- 3. Precio del producto (visible solo para admin/comprador vía RLS de aplicación, no de base de datos:
--    el campo existe para todos, pero la app solo lo muestra a admin/comprador)
alter table public.productos add column precio numeric(10,2) not null default 0;

-- 4. Datos adicionales del pedido: contacto, dirección, fecha requerida, total y aprobación
alter table public.pedidos add column nombre_contacto text;
alter table public.pedidos add column telefono_contacto text;
alter table public.pedidos add column direccion_entrega_id uuid references public.direcciones(id);
alter table public.pedidos add column fecha_requerida date;
alter table public.pedidos add column total_estimado numeric(10,2) default 0;
alter table public.pedidos add column requiere_aprobacion boolean not null default false;
alter table public.pedidos add column aprobado boolean; -- null = pendiente, true = aprobado, false = rechazado
alter table public.pedidos add column aprobado_por uuid references public.profiles(id);
alter table public.pedidos add column aprobado_en timestamptz;

-- 5. Configuración general (límite de aprobación automática, editable por el admin)
create table public.configuracion (
  id int primary key default 1,
  limite_aprobacion numeric(10,2) not null default 200,
  constraint configuracion_singleton check (id = 1)
);

insert into public.configuracion (id, limite_aprobacion) values (1, 200);

alter table public.configuracion enable row level security;

create policy "ver configuracion" on public.configuracion
  for select using (auth.role() = 'authenticated');
create policy "admin edita configuracion" on public.configuracion
  for update using (public.get_my_role() = 'admin');

-- 6. El responsable necesita poder actualizar el pedido (aprobar/rechazar), no solo verlo
create policy "responsable aprueba sus asignados" on public.pedidos
  for update using (responsable_id = auth.uid());
