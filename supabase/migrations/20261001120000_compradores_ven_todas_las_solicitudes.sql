-- Los compradores pueden ver y gestionar las solicitudes de TODOS los
-- compradores (no solo las que tienen asignadas). La asignación
-- (pedidos.comprador_id) se mantiene: sirve para el filtro "Asignadas a mí",
-- el contador del menú y las notificaciones.
--
-- Se añaden políticas nuevas (permisivas, se suman a las existentes); no se
-- borra ninguna de las anteriores.

create or replace function public.es_comprador()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') = 'comprador';
$function$;

-- Solicitudes y líneas
drop policy if exists "compradores ven todas las solicitudes" on public.pedidos;
create policy "compradores ven todas las solicitudes" on public.pedidos
  for select using (public.es_comprador());

drop policy if exists "compradores gestionan todas las solicitudes" on public.pedidos;
create policy "compradores gestionan todas las solicitudes" on public.pedidos
  for update using (public.es_comprador());

drop policy if exists "compradores ven todas las lineas" on public.pedido_items;
create policy "compradores ven todas las lineas" on public.pedido_items
  for select using (public.es_comprador());

drop policy if exists "compradores gestionan todas las lineas" on public.pedido_items;
create policy "compradores gestionan todas las lineas" on public.pedido_items
  for update using (public.es_comprador());

-- Emails al proveedor y marca "PDF enviado"
drop policy if exists "compradores ven todos los emails de pedidos" on public.pedido_emails;
create policy "compradores ven todos los emails de pedidos" on public.pedido_emails
  for select using (public.es_comprador());

drop policy if exists "compradores registran emails de cualquier pedido" on public.pedido_emails;
create policy "compradores registran emails de cualquier pedido" on public.pedido_emails
  for insert with check (public.es_comprador());

drop policy if exists "compradores ven todas las marcas pdf enviado" on public.pedido_compra_pdf_enviado;
create policy "compradores ven todas las marcas pdf enviado" on public.pedido_compra_pdf_enviado
  for select using (public.es_comprador());

-- Datos necesarios para mostrar y tramitar la solicitud (solicitante y dirección de entrega)
drop policy if exists "compradores ven todos los perfiles" on public.profiles;
create policy "compradores ven todos los perfiles" on public.profiles
  for select using (public.es_comprador());

drop policy if exists "compradores ven todas las direcciones" on public.direcciones;
create policy "compradores ven todas las direcciones" on public.direcciones
  for select using (public.es_comprador());

-- Funciones con comprobación de permisos propia
create or replace function public.marcar_pdf_enviado(p_numero_tecmelec text, p_valor boolean)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pedido_id uuid;
  v_comprador_id uuid;
begin
  select pi.pedido_id, p.comprador_id
  into v_pedido_id, v_comprador_id
  from public.pedido_items pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.numero_tecmelec = p_numero_tecmelec
  limit 1;

  if v_pedido_id is null then
    raise exception 'Pedido no encontrado.';
  end if;

  if coalesce(public.get_my_role(), '') not in ('admin', 'comprador')
     and v_comprador_id is distinct from auth.uid()
     and not public.es_sustituto_de(v_comprador_id) then
    raise exception 'No tienes permiso sobre este pedido.';
  end if;

  insert into public.pedido_compra_pdf_enviado (numero_tecmelec, pedido_id, pdf_enviado, actualizado_por, actualizado_en)
  values (p_numero_tecmelec, v_pedido_id, p_valor, auth.uid(), now())
  on conflict (numero_tecmelec) do update
    set pdf_enviado = excluded.pdf_enviado,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = excluded.actualizado_en;

  return p_valor;
end;
$function$;

create or replace function public.crear_enlace_proveedor(p_numero_tecmelec text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pedido_id uuid;
  v_comprador_id uuid;
  v_token uuid;
begin
  select pi.pedido_id, p.comprador_id
  into v_pedido_id, v_comprador_id
  from public.pedido_items pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.numero_tecmelec = p_numero_tecmelec
  limit 1;

  if v_pedido_id is null then
    raise exception 'Pedido no encontrado.';
  end if;

  if coalesce(public.get_my_role(), '') not in ('admin', 'comprador')
     and v_comprador_id is distinct from auth.uid()
     and not public.es_sustituto_de(v_comprador_id) then
    raise exception 'No tienes permiso sobre este pedido.';
  end if;

  select token into v_token
  from public.enlaces_proveedor_pedido
  where numero_tecmelec = p_numero_tecmelec
  order by created_at desc
  limit 1;

  if v_token is null then
    insert into public.enlaces_proveedor_pedido (pedido_id, numero_tecmelec, creado_por)
    values (v_pedido_id, p_numero_tecmelec, auth.uid())
    returning token into v_token;
  end if;

  return v_token;
end;
$function$;

-- Selección guardada de los filtros rápidos "Por usuario" y "Por obra" de
-- cada comprador (una fila por usuario).
create table if not exists public.filtros_rapidos_solicitudes (
  usuario_id uuid primary key references public.profiles(id) on delete cascade,
  solicitantes uuid[] not null default '{}',
  obras text[] not null default '{}', -- Nº de obra de BC (proyectos.bc_job_no)
  updated_at timestamptz not null default now()
);

alter table public.filtros_rapidos_solicitudes enable row level security;

drop policy if exists "usuario gestiona sus filtros rapidos" on public.filtros_rapidos_solicitudes;
create policy "usuario gestiona sus filtros rapidos" on public.filtros_rapidos_solicitudes
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
