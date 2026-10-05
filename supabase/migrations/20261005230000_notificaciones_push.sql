-- Notificaciones push al móvil (Web Push) y avisos nuevos en la campana.
--
-- 1) push_suscripciones: un registro por dispositivo en el que el usuario ha
--    activado los avisos (puede tener varios).
-- 2) notificaciones.push_enviado: cada aviso de la campana se envía también
--    una vez a los dispositivos del usuario; esta marca evita repetirlo.
-- 3) Avisos nuevos (además de los de "Seguir pedido" y alta de artículos):
--    - Responsable: nueva solicitud pendiente de su aprobación.
--    - Comprador: nueva solicitud por tramitar (aprobada automáticamente o
--      recién aprobada por el responsable).
--    - Solicitante: su solicitud ha sido aprobada / rechazada (antes solo si
--      tenía "Seguir pedido" activado; ahora siempre).

create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz
);
create index if not exists push_suscripciones_usuario_idx on public.push_suscripciones (usuario_id);

alter table public.push_suscripciones enable row level security;

drop policy if exists "usuario gestiona sus suscripciones push" on public.push_suscripciones;
create policy "usuario gestiona sus suscripciones push" on public.push_suscripciones
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

alter table public.notificaciones add column if not exists push_enviado boolean not null default false;
-- Lo anterior a este cambio no se envía al móvil.
update public.notificaciones set push_enviado = true where push_enviado = false and created_at < now();

create index if not exists notificaciones_push_pendiente_idx
  on public.notificaciones (created_at) where push_enviado = false;

-- Aviso al responsable / comprador cuando entra una solicitud nueva o se aprueba.
create or replace function public.notificar_nueva_solicitud()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_solicitante text;
  v_importe text;
  v_obra text;
begin
  select nombre_completo into v_solicitante from public.profiles where id = new.usuario_id;
  select bc_job_no into v_obra from public.proyectos where id = new.proyecto_id;
  v_importe := replace(to_char(coalesce(new.total_estimado, 0), 'FM999999990.00'), '.', ',') || ' €';

  -- Pendiente de aprobación -> responsable
  if tg_op = 'INSERT' and new.requiere_aprobacion and new.aprobado is null
     and new.responsable_id is not null and new.responsable_id is distinct from new.usuario_id then
    insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje, enlace)
    values (
      new.responsable_id, new.id, new.numero_app,
      'Solicitud ' || new.numero_app || ' de ' || coalesce(v_solicitante, 'un usuario') ||
        coalesce(' (obra ' || v_obra || ')', '') || ' por ' || v_importe || ' pendiente de tu aprobación.',
      '/responsable/' || new.id
    );
  end if;

  -- Lista para tramitar -> comprador (al crearse ya aprobada, o al aprobarla el responsable)
  if new.comprador_id is not null and new.comprador_id is distinct from new.usuario_id
     and new.aprobado is true
     and (tg_op = 'INSERT' or old.aprobado is distinct from true) then
    insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje, enlace)
    values (
      new.comprador_id, new.id, new.numero_app,
      'Nueva solicitud ' || new.numero_app || ' de ' || coalesce(v_solicitante, 'un usuario') ||
        coalesce(' (obra ' || v_obra || ')', '') || ' por tramitar.',
      '/comprador/' || new.id
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists pedidos_notificar_nueva_solicitud on public.pedidos;
create trigger pedidos_notificar_nueva_solicitud
  after insert or update of aprobado on public.pedidos
  for each row execute function public.notificar_nueva_solicitud();

-- Aprobada / rechazada -> solicitante, siempre (antes solo con "Seguir pedido").
-- Los cambios de estado general siguen dependiendo de "Seguir pedido".
create or replace function public.trigger_notificar_cambio_pedido()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.aprobado is distinct from old.aprobado and new.aprobado is not null then
    insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje)
    values (
      new.usuario_id, new.id, new.numero_app,
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
$function$;
