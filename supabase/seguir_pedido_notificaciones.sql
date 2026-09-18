-- Seguimiento de pedidos + notificaciones de cambio de estado
-- (ya ejecutado en Supabase, proyecto "Portal Compras" — este script queda
-- como referencia para fusionar en esquema_completo_actualizado.sql)

-- 1. Flag "Seguir pedido" en la solicitud
alter table public.pedidos
  add column if not exists seguir_pedido boolean not null default false;

-- 2. Tabla de notificaciones
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  numero_app text,
  mensaje text not null,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notificaciones_usuario_no_leidas
  on public.notificaciones (usuario_id, leido, created_at desc);

alter table public.notificaciones enable row level security;

drop policy if exists "usuario ve sus notificaciones" on public.notificaciones;
create policy "usuario ve sus notificaciones"
  on public.notificaciones for select
  using (usuario_id = auth.uid());

drop policy if exists "usuario marca sus notificaciones" on public.notificaciones;
create policy "usuario marca sus notificaciones"
  on public.notificaciones for update
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- Sin policy de INSERT para "authenticated": las notificaciones solo las
-- crean los triggers de abajo (funciones "security definer", saltan RLS).

-- 3. Función auxiliar: crea la notificación solo si el pedido tiene
--    seguir_pedido = true, para el usuario que hizo la solicitud.
create or replace function public.notificar_cambio_estado_pedido(p_pedido_id uuid, p_mensaje text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_numero_app text;
  v_seguir boolean;
begin
  select usuario_id, numero_app, seguir_pedido
    into v_usuario_id, v_numero_app, v_seguir
    from public.pedidos
    where id = p_pedido_id;

  if v_seguir then
    insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje)
    values (v_usuario_id, p_pedido_id, v_numero_app, p_mensaje);
  end if;
end;
$$;

-- 4. Trigger: cambios de aprobación / estado_general en "pedidos"
create or replace function public.trigger_notificar_cambio_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.aprobado is distinct from old.aprobado and new.aprobado is not null then
    perform public.notificar_cambio_estado_pedido(
      new.id,
      case when new.aprobado
        then 'Tu solicitud ' || new.numero_app || ' ha sido aprobada.'
        else 'Tu solicitud ' || new.numero_app || ' ha sido rechazada.'
      end
    );
  end if;

  if new.estado_general is distinct from old.estado_general then
    perform public.notificar_cambio_estado_pedido(
      new.id,
      'Tu solicitud ' || new.numero_app || ' ha cambiado de estado: ' || new.estado_general || '.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists pedidos_notificar_cambio on public.pedidos;
create trigger pedidos_notificar_cambio
  after update on public.pedidos
  for each row
  execute function public.trigger_notificar_cambio_pedido();

-- 5. Trigger: cambios de estado_id / estado_recepcion por línea (más fino:
--    "Pedido lanzado", "Recibido parcial", "Recibido completo", etc.)
create or replace function public.trigger_notificar_cambio_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_estado text;
begin
  if new.estado_id is distinct from old.estado_id then
    select nombre into v_nombre_estado from public.estados_pedido where id = new.estado_id;
    perform public.notificar_cambio_estado_pedido(
      new.pedido_id,
      'Tu pedido' || coalesce(' ' || new.numero_tecmelec, '') || ' ha pasado a "' ||
        coalesce(v_nombre_estado, '') || '".'
    );
  elsif new.estado_recepcion is distinct from old.estado_recepcion and new.estado_recepcion is not null then
    perform public.notificar_cambio_estado_pedido(
      new.pedido_id,
      'Tu pedido' || coalesce(' ' || new.numero_tecmelec, '') || ' ha pasado a "' ||
        new.estado_recepcion || '".'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists pedido_items_notificar_cambio on public.pedido_items;
create trigger pedido_items_notificar_cambio
  after update on public.pedido_items
  for each row
  execute function public.trigger_notificar_cambio_item();

-- 6. Habilitar Realtime para que la campana reciba los INSERT al instante
alter publication supabase_realtime add table public.notificaciones;
