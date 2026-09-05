-- ============================================================
-- SUSTITUTO para comprador/responsable (ej: vacaciones)
-- ============================================================

-- 1. Campos nuevos en el perfil
alter table public.profiles add column sustituto_id uuid references public.profiles(id);
alter table public.profiles add column sustituto_activo boolean not null default false;

-- 2. Función segura: ¿el usuario actual es el sustituto ACTIVO de target_id?
-- (security definer, igual que get_my_role(), para evitar recursión en RLS)
create or replace function public.es_sustituto_de(target_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = target_id
    and sustituto_id = auth.uid()
    and sustituto_activo = true
  );
$$;

-- ============================================================
-- Actualizar políticas para incluir al sustituto activo
-- ============================================================

-- PEDIDOS: comprador
drop policy if exists "comprador ve sus asignados" on public.pedidos;
create policy "comprador ve sus asignados" on public.pedidos
  for select using (comprador_id = auth.uid() or public.es_sustituto_de(comprador_id));

drop policy if exists "comprador actualiza sus asignados" on public.pedidos;
create policy "comprador actualiza sus asignados" on public.pedidos
  for update using (comprador_id = auth.uid() or public.es_sustituto_de(comprador_id));

-- PEDIDOS: responsable
drop policy if exists "responsable ve sus asignados" on public.pedidos;
create policy "responsable ve sus asignados" on public.pedidos
  for select using (responsable_id = auth.uid() or public.es_sustituto_de(responsable_id));

drop policy if exists "responsable aprueba sus asignados" on public.pedidos;
create policy "responsable aprueba sus asignados" on public.pedidos
  for update using (responsable_id = auth.uid() or public.es_sustituto_de(responsable_id));

-- PEDIDO_ITEMS: ver (agrega el caso de sustituto)
drop policy if exists "ver items de pedidos accesibles" on public.pedido_items;
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

-- PEDIDO_ITEMS: actualizar (Nº pedido Tecmelec por línea)
drop policy if exists "comprador actualiza items de sus asignados" on public.pedido_items;
create policy "comprador actualiza items de sus asignados" on public.pedido_items
  for update using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
      and (p.comprador_id = auth.uid() or public.es_sustituto_de(p.comprador_id))
    )
  );

-- PROFILES: ver perfiles de usuarios asignados (para ver el nombre del solicitante)
drop policy if exists "comprador ve perfiles de sus asignados" on public.profiles;
create policy "comprador ve perfiles de sus asignados" on public.profiles
  for select using (comprador_id = auth.uid() or public.es_sustituto_de(comprador_id));

drop policy if exists "responsable ve perfiles de sus asignados" on public.profiles;
create policy "responsable ve perfiles de sus asignados" on public.profiles
  for select using (responsable_id = auth.uid() or public.es_sustituto_de(responsable_id));

-- DIRECCIONES: ver direcciones de usuarios asignados
drop policy if exists "comprador ve direcciones de sus asignados" on public.direcciones;
create policy "comprador ve direcciones de sus asignados" on public.direcciones
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = usuario_id
      and (p.comprador_id = auth.uid() or public.es_sustituto_de(p.comprador_id))
    )
  );

drop policy if exists "responsable ve direcciones de sus asignados" on public.direcciones;
create policy "responsable ve direcciones de sus asignados" on public.direcciones
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = usuario_id
      and (p.responsable_id = auth.uid() or public.es_sustituto_de(p.responsable_id))
    )
  );
