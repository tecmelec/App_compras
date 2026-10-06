-- Aviso al comprador (campana + móvil) cuando un Pedido Tecmelec queda listo
-- para enviarse por email al proveedor: todas sus líneas han llegado a
-- "Pedido lanzado" (o posterior) y aún no tiene marcado "PDF enviado".
-- Misma regla que habilita el botón de email en la gestión de la solicitud.
create or replace function public.notificar_pedido_listo_para_enviar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_orden_lanzado integer;
  v_orden_nuevo integer;
  v_orden_viejo integer;
  v_orden_min integer;
  v_pedido record;
  v_proveedor text;
  v_mensaje text;
begin
  if new.numero_tecmelec is null or new.numero_tecmelec = '' then
    return new;
  end if;

  select orden into v_orden_lanzado from public.estados_pedido where lower(trim(nombre)) = 'pedido lanzado' limit 1;
  if v_orden_lanzado is null then
    return new;
  end if;

  select orden into v_orden_nuevo from public.estados_pedido where id = new.estado_id;
  select orden into v_orden_viejo from public.estados_pedido where id = old.estado_id;

  -- Solo cuando esta línea acaba de alcanzar "Pedido lanzado" (o se le acaba
  -- de asignar el Nº de pedido estando ya lanzada).
  if coalesce(v_orden_nuevo, -1) < v_orden_lanzado then
    return new;
  end if;
  if coalesce(v_orden_viejo, -1) >= v_orden_lanzado and old.numero_tecmelec is not distinct from new.numero_tecmelec then
    return new;
  end if;

  -- Todas las líneas de ese Pedido Tecmelec deben estar ya lanzadas.
  select min(coalesce(e.orden, -1)) into v_orden_min
  from public.pedido_items pi
  left join public.estados_pedido e on e.id = pi.estado_id
  where pi.numero_tecmelec = new.numero_tecmelec;
  if v_orden_min < v_orden_lanzado then
    return new;
  end if;

  -- Si ya está marcado "PDF enviado", no hace falta avisar.
  if exists (select 1 from public.pedido_compra_pdf_enviado where numero_tecmelec = new.numero_tecmelec and pdf_enviado) then
    return new;
  end if;

  select id, numero_app, comprador_id into v_pedido from public.pedidos where id = new.pedido_id;
  if v_pedido.comprador_id is null then
    return new;
  end if;

  select nombre into v_proveedor from public.proveedores where id = new.proveedor_id;
  v_mensaje := 'El pedido ' || new.numero_tecmelec || coalesce(' (' || v_proveedor || ')', '') ||
               ' de la solicitud ' || v_pedido.numero_app || ' ya se puede enviar por email al proveedor.';

  -- Un único aviso por pedido aunque se actualicen varias líneas a la vez.
  if exists (
    select 1 from public.notificaciones
    where usuario_id = v_pedido.comprador_id and mensaje = v_mensaje and created_at > now() - interval '1 day'
  ) then
    return new;
  end if;

  insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje, enlace)
  values (v_pedido.comprador_id, v_pedido.id, v_pedido.numero_app, v_mensaje, '/comprador/' || v_pedido.id);

  return new;
end;
$function$;

drop trigger if exists pedido_items_notificar_listo_para_enviar on public.pedido_items;
create trigger pedido_items_notificar_listo_para_enviar
  after update of estado_id, numero_tecmelec on public.pedido_items
  for each row execute function public.notificar_pedido_listo_para_enviar();
