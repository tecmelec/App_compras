-- Proyectos renumerados en Business Central (p. ej. E260308 → M260325).
-- BC cambia el Nº del proyecto; al sincronizar, la app crea el nuevo y el antiguo se
-- queda huérfano con sus solicitudes, usuarios, aprobadores, tienda del proyecto…
--
-- 1. proyectos.en_bc: false si el proyecto ya no aparece en BC al sincronizar.
-- 2. renumerar_proyecto('E260308', 'M260325'): pasa todo del antiguo al nuevo.
--    - Si el nuevo aún no está en la app, simplemente cambia el Nº del antiguo (la
--      siguiente sincronización le pone los datos de BC).
--    - Si ya está (lo creó la sincronización), mueve solicitudes, proyectos asignados,
--      proyectos de consulta, aprobadores, favoritos y tienda del proyecto (si el mismo
--      artículo está en las dos, se suman las cantidades) y borra el antiguo.
--    Cada solicitud movida queda en el registro de cambios de proyecto.
--    Se puede ejecutar a mano en el SQL Editor o desde Admin → Proyectos.

alter table public.proyectos add column if not exists en_bc boolean not null default true;

create or replace function public.renumerar_proyecto(p_antiguo text, p_nuevo text, p_usuario text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ant uuid;
  v_nue uuid;
  v_pedidos int := 0;
  r record;
begin
  p_antiguo := upper(trim(p_antiguo));
  p_nuevo := upper(trim(p_nuevo));
  if p_antiguo = '' or p_nuevo = '' or p_antiguo = p_nuevo then
    raise exception 'Indica el Nº antiguo y el nuevo (distintos).';
  end if;

  select id into v_ant from proyectos where upper(bc_job_no) = p_antiguo;
  if v_ant is null then
    raise exception 'El proyecto % no está en la app.', p_antiguo;
  end if;
  select id into v_nue from proyectos where upper(bc_job_no) = p_nuevo;

  -- El nuevo aún no está en la app: basta con cambiarle el Nº al antiguo.
  if v_nue is null then
    update proyectos set bc_job_no = p_nuevo, en_bc = true where id = v_ant;
    if to_regclass('public.pedido_cambios_proyecto') is not null then
      insert into pedido_cambios_proyecto (pedido_id, proyecto_anterior_id, proyecto_nuevo_id, job_no_anterior, job_no_nuevo, origen, comentario, usuario_nombre)
      select id, v_ant, v_ant, p_antiguo, p_nuevo, 'bc', 'Proyecto renumerado en BC.', coalesce(p_usuario, 'Renumeración de proyecto')
      from pedidos where proyecto_id = v_ant;
    end if;
    return format('Proyecto %s renombrado a %s.', p_antiguo, p_nuevo);
  end if;

  -- Registro de cambios de cada solicitud (antes de moverlas).
  if to_regclass('public.pedido_cambios_proyecto') is not null then
    insert into pedido_cambios_proyecto (pedido_id, proyecto_anterior_id, proyecto_nuevo_id, job_no_anterior, job_no_nuevo, origen, comentario, usuario_nombre)
    select id, v_ant, v_nue, p_antiguo, p_nuevo, 'bc', 'Proyecto renumerado en BC.', coalesce(p_usuario, 'Renumeración de proyecto')
    from pedidos where proyecto_id = v_ant;
  end if;

  update pedidos set proyecto_id = v_nue where proyecto_id = v_ant;
  get diagnostics v_pedidos = row_count;

  -- Proyectos asignados y de consulta, aprobadores y favoritos (sin duplicar).
  insert into usuario_proyectos (usuario_id, proyecto_id)
    select usuario_id, v_nue from usuario_proyectos where proyecto_id = v_ant
    on conflict do nothing;
  delete from usuario_proyectos where proyecto_id = v_ant;

  if to_regclass('public.usuario_proyectos_consulta') is not null then
    insert into usuario_proyectos_consulta (usuario_id, proyecto_id)
      select usuario_id, v_nue from usuario_proyectos_consulta where proyecto_id = v_ant
      on conflict do nothing;
    delete from usuario_proyectos_consulta where proyecto_id = v_ant;
  end if;

  if to_regclass('public.proyecto_aprobadores') is not null then
    insert into proyecto_aprobadores (proyecto_id, usuario_id)
      select v_nue, usuario_id from proyecto_aprobadores where proyecto_id = v_ant
      on conflict do nothing;
    delete from proyecto_aprobadores where proyecto_id = v_ant;
  end if;

  if to_regclass('public.tienda_proyecto_favoritos') is not null then
    insert into tienda_proyecto_favoritos (usuario_id, proyecto_id)
      select usuario_id, v_nue from tienda_proyecto_favoritos where proyecto_id = v_ant
      on conflict do nothing;
    delete from tienda_proyecto_favoritos where proyecto_id = v_ant;
  end if;

  -- Tienda del proyecto: los artículos que no están en el nuevo se mueven; si el mismo
  -- artículo está en los dos, se suman las cantidades y el historial pasa al del nuevo.
  if to_regclass('public.tienda_proyecto_articulos') is not null then
    for r in
      select a.id as id_ant, b.id as id_nue, a.cantidad_maxima, a.cantidad_inicial, a.cantidad_ampliada
      from tienda_proyecto_articulos a
      join tienda_proyecto_articulos b on b.producto_id = a.producto_id and b.proyecto_id = v_nue
      where a.proyecto_id = v_ant
    loop
      update tienda_proyecto_articulos
        set cantidad_maxima = cantidad_maxima + r.cantidad_maxima,
            cantidad_inicial = cantidad_inicial + r.cantidad_inicial,
            cantidad_ampliada = cantidad_ampliada + r.cantidad_ampliada,
            updated_at = now()
        where id = r.id_nue;
      update tienda_proyecto_historial set articulo_id = r.id_nue where articulo_id = r.id_ant;
      delete from tienda_proyecto_articulos where id = r.id_ant;
    end loop;
    update tienda_proyecto_articulos set proyecto_id = v_nue where proyecto_id = v_ant;
  end if;

  delete from proyectos where id = v_ant;
  return format('Proyecto %s unido a %s: %s solicitud(es) movida(s).', p_antiguo, p_nuevo, v_pedidos);
end;
$$;

-- Solo el servidor (service role) puede ejecutarla.
revoke all on function public.renumerar_proyecto(text, text, text) from public, anon, authenticated;
