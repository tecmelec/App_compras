-- "Seguir pedido" para cualquier usuario que pueda ver el detalle de una solicitud
-- (no solo el solicitante). El solicitante sigue usando seguimiento_pedidos_tecmelec y
-- pedidos.seguir_pedido como hasta ahora; el resto de usuarios se guardan aquí, uno por
-- usuario y grupo (pedido Tecmelec, o '__sin_asignar__' para las líneas aún sin pedido:
-- quien sigue ese grupo recibe también los avisos de los pedidos que salgan de él).
-- La escritura se hace desde el servidor (service role) tras comprobar el acceso.
create table if not exists public.seguidores_pedido_tecmelec (
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  numero_tecmelec text not null,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pedido_id, numero_tecmelec, usuario_id)
);
create index if not exists seguidores_pedido_tecmelec_usuario_idx on public.seguidores_pedido_tecmelec (usuario_id);

alter table public.seguidores_pedido_tecmelec enable row level security;
drop policy if exists "usuario ve lo que sigue" on public.seguidores_pedido_tecmelec;
create policy "usuario ve lo que sigue" on public.seguidores_pedido_tecmelec
  as permissive for select to public
  using (usuario_id = auth.uid());

-- Avisos de cambio de un pedido Tecmelec: al solicitante (como hasta ahora) y además a
-- quienes lo siguen. A los seguidores el aviso les lleva al detalle de Líns. compras.
CREATE OR REPLACE FUNCTION public.notificar_cambio_pedido_tecmelec(p_pedido_id uuid, p_numero_tecmelec text, p_mensaje text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_usuario_id uuid;
  v_numero_app text;
  v_seguir_defecto boolean;
  v_seguir_explicito boolean;
  v_clave text := coalesce(nullif(p_numero_tecmelec, ''), '__sin_asignar__');
  v_mensaje_seguidor text;
begin
  select usuario_id, numero_app, seguir_pedido
    into v_usuario_id, v_numero_app, v_seguir_defecto
    from public.pedidos
    where id = p_pedido_id;

  select activo into v_seguir_explicito
    from public.seguimiento_pedidos_tecmelec
    where pedido_id = p_pedido_id and numero_tecmelec = v_clave;

  if coalesce(v_seguir_explicito, v_seguir_defecto, false) then
    insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje)
    values (v_usuario_id, p_pedido_id, v_numero_app, p_mensaje);
  end if;

  v_mensaje_seguidor := regexp_replace(p_mensaje, '^Tu pedido', 'El pedido')
    || ' (solicitud ' || coalesce(v_numero_app, '') || ')';

  insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje, enlace)
  select distinct s.usuario_id, p_pedido_id, v_numero_app, v_mensaje_seguidor, '/lineas-compras/' || p_pedido_id
    from public.seguidores_pedido_tecmelec s
    where s.pedido_id = p_pedido_id
      and s.numero_tecmelec in (v_clave, '__sin_asignar__')
      and s.usuario_id is distinct from v_usuario_id;
end;
$function$;
