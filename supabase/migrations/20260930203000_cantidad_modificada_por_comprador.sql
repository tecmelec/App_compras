-- El comprador también puede cambiar la cantidad de una línea (antes de crear el
-- pedido en BC). Para que el aviso "!" cuente quién cambió qué:
--   cantidad_original  = lo que pidió el usuario (ya existía; se rellena al primer cambio)
--   cantidad_aprobador = lo que dejó el aprobador, si la cambió (nuevo)
--   cantidad_modificada_por_comprador = el comprador cambió la cantidad después (nuevo)
--   cantidad           = la cantidad vigente
alter table public.pedido_items
  add column if not exists cantidad_aprobador integer,
  add column if not exists cantidad_modificada_por_comprador boolean not null default false;

-- Hasta ahora solo el aprobador podía cambiar cantidades.
update public.pedido_items
  set cantidad_aprobador = cantidad
  where cantidad_original is not null and cantidad_aprobador is null;

-- La aprobación con cambios guarda también la cantidad que deja el aprobador.
create or replace function public.aprobar_solicitud_con_cambios(p_pedido_id uuid, p_lineas jsonb)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pedido record;
  v_linea jsonb;
  v_item record;
  v_cantidad integer;
  v_multiplo integer;
  v_estado_anulado integer;
  v_restantes integer;
begin
  select id, responsable_id, requiere_aprobacion, aprobado into v_pedido
  from public.pedidos where id = p_pedido_id for update;

  if v_pedido.id is null then
    raise exception 'Solicitud no encontrada.';
  end if;

  if coalesce(public.get_my_role(), '') <> 'admin'
     and v_pedido.responsable_id is distinct from auth.uid()
     and not public.es_sustituto_de(v_pedido.responsable_id) then
    raise exception 'No tienes permiso para aprobar esta solicitud.';
  end if;

  if not v_pedido.requiere_aprobacion then
    raise exception 'Esta solicitud no requiere aprobación.';
  end if;

  if v_pedido.aprobado is not null then
    raise exception 'Esta solicitud ya fue aprobada o rechazada.';
  end if;

  select id into v_estado_anulado from public.estados_pedido where lower(trim(nombre)) = 'anulado' limit 1;

  for v_linea in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    select pi.id, pi.cantidad, pi.cantidad_original, coalesce(pr.multiplo_compra, 1) as multiplo
    into v_item
    from public.pedido_items pi
    left join public.productos pr on pr.id = pi.producto_id
    where pi.id = (v_linea->>'id')::uuid and pi.pedido_id = p_pedido_id;

    if v_item.id is null then
      raise exception 'Línea no válida para esta solicitud.';
    end if;

    if coalesce((v_linea->>'rechazada')::boolean, false) then
      update public.pedido_items
        set rechazada_por_aprobador = true,
            estado_id = coalesce(v_estado_anulado, estado_id)
        where id = v_item.id;
    elsif v_linea ? 'cantidad' then
      v_cantidad := (v_linea->>'cantidad')::integer;
      v_multiplo := greatest(v_item.multiplo, 1);
      if v_cantidad is null or v_cantidad <= 0 then
        raise exception 'La cantidad debe ser mayor que 0 (para quitar una línea, recházala).';
      end if;
      if v_cantidad % v_multiplo <> 0 then
        raise exception 'La cantidad % no es múltiplo de %.', v_cantidad, v_multiplo;
      end if;
      if v_cantidad <> v_item.cantidad then
        update public.pedido_items
          set cantidad_original = coalesce(cantidad_original, cantidad),
              cantidad_aprobador = v_cantidad,
              cantidad = v_cantidad
          where id = v_item.id;
      end if;
    end if;
  end loop;

  select count(*) into v_restantes
  from public.pedido_items where pedido_id = p_pedido_id and not rechazada_por_aprobador;

  if v_restantes = 0 then
    update public.pedidos
      set aprobado = false, aprobado_por = auth.uid(), aprobado_en = now(), updated_at = now()
      where id = p_pedido_id;
    return 'rechazada';
  end if;

  update public.pedidos p
    set aprobado = true,
        aprobado_por = auth.uid(),
        aprobado_en = now(),
        updated_at = now(),
        total_estimado = (
          select coalesce(sum(coalesce(pi.precio_unitario, pr.precio, 0) * pi.cantidad), 0)
          from public.pedido_items pi
          left join public.productos pr on pr.id = pi.producto_id
          where pi.pedido_id = p_pedido_id and not pi.rechazada_por_aprobador
        )
    where p.id = p_pedido_id;

  return 'aprobada';
end;
$function$;
