-- =============================================================================
-- Esquema base de la Tienda Tecmelec (Portal de solicitud de materiales)
-- Extraído de la base real (proyecto Supabase "Portal Compras", oappnsquhmgccjnlistx)
-- el 29/09/2026. Solo incluye los objetos de la Tienda: NO las tablas crm_* ni
-- almacen_* (otras aplicaciones que comparten esa base).
--
-- A partir de aquí, cada cambio de estructura va en un archivo nuevo de esta
-- carpeta, se aplica primero en la base de PRUEBAS y, al pasar a main, en la REAL.
-- =============================================================================

set check_function_bodies = off;

-- ---------- Secuencias ----------
create sequence public.estados_pedido_id_seq as integer start 1 increment 1;
create sequence public.pedido_numero_seq as bigint start 1 increment 1;

-- ---------- Funciones ----------
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select rol from public.profiles where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_my_comprador_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select comprador_id from public.profiles where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_sustituto_de_mi_comprador()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select sustituto_id from public.profiles
  where id = public.get_my_comprador_id() and sustituto_activo = true;
$function$;

CREATE OR REPLACE FUNCTION public.es_sustituto_de(target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from public.profiles
    where id = target_id
    and sustituto_id = auth.uid()
    and sustituto_activo = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.resolver_sustituto(id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce(
    (select sustituto_id from public.profiles
     where id = $1 and sustituto_activo = true and sustituto_id is not null),
    id
  );
$function$;

CREATE OR REPLACE FUNCTION public.generar_numero_app()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  anio_actual int := extract(year from now())::int;
  yy text := to_char(now(), 'YY');
  siguiente int;
begin
  insert into public.secuencias_numero_app (anio, ultimo)
  values (anio_actual, 1)
  on conflict (anio) do update set ultimo = public.secuencias_numero_app.ultimo + 1
  returning ultimo into siguiente;

  return 'APP-' || yy || lpad(siguiente::text, 5, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.crear_enlace_proveedor(p_numero_tecmelec text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if coalesce(public.get_my_role(), '') <> 'admin'
     and v_comprador_id is distinct from auth.uid()
     and not public.es_sustituto_de(v_comprador_id) then
    raise exception 'No tienes permiso sobre este pedido.';
  end if;

  -- Reutiliza el enlace manual más reciente si ya existe uno para este
  -- Pedido Tecmelec, en vez de generar uno nuevo cada vez que se pulsa el botón.
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

CREATE OR REPLACE FUNCTION public.marcar_pdf_enviado(p_numero_tecmelec text, p_valor boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if coalesce(public.get_my_role(), '') <> 'admin'
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

CREATE OR REPLACE FUNCTION public.aprobar_solicitud_con_cambios(p_pedido_id uuid, p_lineas jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.notificar_cambio_estado_pedido(p_pedido_id uuid, p_mensaje text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

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
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_seguir_pedido(p_pedido_id uuid, p_seguir boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.pedidos
    set seguir_pedido = p_seguir
    where id = p_pedido_id
      and usuario_id = auth.uid();

  if not found then
    raise exception 'No autorizado o pedido no encontrado';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_seguir_pedido_tecmelec(p_pedido_id uuid, p_numero_tecmelec text, p_activo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_usuario_id uuid;
  v_clave text := coalesce(nullif(p_numero_tecmelec, ''), '__sin_asignar__');
begin
  select usuario_id into v_usuario_id from public.pedidos where id = p_pedido_id;

  if v_usuario_id is null or v_usuario_id <> auth.uid() then
    raise exception 'No autorizado o pedido no encontrado';
  end if;

  insert into public.seguimiento_pedidos_tecmelec (pedido_id, numero_tecmelec, usuario_id, activo)
  values (p_pedido_id, v_clave, v_usuario_id, p_activo)
  on conflict (pedido_id, numero_tecmelec)
  do update set activo = excluded.activo, updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.subir_lineas_a_solicitud_aprobada(p_pedido_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aprobada record;
begin
  select id, orden into v_aprobada from public.estados_pedido
  where lower(trim(nombre)) = 'solicitud aprobada' limit 1;
  if v_aprobada.id is null then return; end if;

  update public.pedido_items pi
    set estado_id = v_aprobada.id
  where pi.pedido_id = p_pedido_id
    and not pi.rechazada_por_aprobador
    and coalesce((select e.orden from public.estados_pedido e where e.id = pi.estado_id), 0) < v_aprobada.orden;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_pedido_items_estado_si_aprobado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aprobado boolean;
  v_aprobada record;
  v_orden_actual integer;
begin
  select aprobado into v_aprobado from public.pedidos where id = new.pedido_id;
  if v_aprobado is not true or new.rechazada_por_aprobador then return new; end if;

  select id, orden into v_aprobada from public.estados_pedido
  where lower(trim(nombre)) = 'solicitud aprobada' limit 1;
  if v_aprobada.id is null then return new; end if;

  select orden into v_orden_actual from public.estados_pedido where id = new.estado_id;
  if coalesce(v_orden_actual, 0) < v_aprobada.orden then
    new.estado_id := v_aprobada.id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_pedidos_aprobado_subir_lineas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.aprobado is true and old.aprobado is distinct from true then
    perform public.subir_lineas_a_solicitud_aprobada(new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_notificar_cambio_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nombre_estado text;
begin
  if new.estado_id is distinct from old.estado_id then
    select nombre into v_nombre_estado from public.estados_pedido where id = new.estado_id;
    perform public.notificar_cambio_pedido_tecmelec(
      new.pedido_id,
      new.numero_tecmelec,
      'Tu pedido' || coalesce(' ' || new.numero_tecmelec, '') || ' ha pasado a "' ||
        coalesce(v_nombre_estado, '') || '".'
    );
  elsif new.estado_recepcion is distinct from old.estado_recepcion and new.estado_recepcion is not null then
    perform public.notificar_cambio_pedido_tecmelec(
      new.pedido_id,
      new.numero_tecmelec,
      'Tu pedido' || coalesce(' ' || new.numero_tecmelec, '') || ' ha pasado a "' ||
        new.estado_recepcion || '".'
    );
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_notificar_cambio_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ---------- Tablas ----------
create table public.configuracion (
  id integer default 1 not null,
  limite_aprobacion numeric(10,2) default 200 not null,
  constraint configuracion_pkey PRIMARY KEY (id),
  constraint configuracion_singleton CHECK ((id = 1))
);

create table public.contactos_email_ocultos (
  usuario_id uuid not null,
  email text not null,
  oculto_desde timestamp with time zone default now() not null,
  constraint contactos_email_ocultos_pkey PRIMARY KEY (usuario_id, email)
);

create table public.direcciones (
  id uuid default gen_random_uuid() not null,
  usuario_id uuid not null,
  alias text not null,
  direccion text not null,
  codigo_postal text,
  ciudad text,
  provincia text,
  created_at timestamp with time zone default now() not null,
  oculta boolean default false not null,
  constraint direcciones_pkey PRIMARY KEY (id)
);

create table public.enlaces_proveedor_pedido (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  numero_tecmelec text not null,
  token uuid default gen_random_uuid() not null,
  creado_por uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint enlaces_proveedor_pedido_token_key UNIQUE (token),
  constraint enlaces_proveedor_pedido_pkey PRIMARY KEY (id)
);

create table public.estados_pedido (
  id integer default nextval('estados_pedido_id_seq'::regclass) not null,
  nombre text not null,
  orden integer not null,
  constraint estados_pedido_nombre_key UNIQUE (nombre),
  constraint estados_pedido_pkey PRIMARY KEY (id)
);
alter sequence public.estados_pedido_id_seq owned by public.estados_pedido.id;

create table public.favoritos (
  usuario_id uuid not null,
  producto_id uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint favoritos_pkey PRIMARY KEY (usuario_id, producto_id)
);

create table public.notificaciones (
  id uuid default gen_random_uuid() not null,
  usuario_id uuid not null,
  pedido_id uuid not null,
  numero_app text,
  mensaje text not null,
  leido boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint notificaciones_pkey PRIMARY KEY (id)
);

create table public.pedido_compra_pdf_enviado (
  numero_tecmelec text not null,
  pedido_id uuid not null,
  pdf_enviado boolean default false not null,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null,
  constraint pedido_compra_pdf_enviado_pkey PRIMARY KEY (numero_tecmelec)
);

create table public.pedido_emails (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  numero_tecmelec text not null,
  enviado_por uuid not null,
  buzon text not null,
  destinatarios text[] not null,
  asunto text not null,
  mensaje text not null,
  con_fotos boolean default false not null,
  graph_message_id text,
  graph_conversation_id text,
  created_at timestamp with time zone default now() not null,
  token uuid default gen_random_uuid() not null,
  cc text[] default '{}'::text[] not null,
  constraint pedido_emails_pkey PRIMARY KEY (id)
);

create table public.pedido_items (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  producto_id uuid not null,
  cantidad integer not null,
  numero_tecmelec text,
  fecha_estimada_entrega date,
  estado_id integer default 1 not null,
  estado_recepcion text default 'Pendiente de recibir'::text not null,
  proveedor_id uuid,
  precio_unitario numeric(12,5),
  fecha_estimada_entrega_confirmada_en timestamp with time zone,
  cantidad_original integer,
  rechazada_por_aprobador boolean default false not null,
  constraint pedido_items_pkey PRIMARY KEY (id),
  constraint pedido_items_cantidad_check CHECK ((cantidad > 0)),
  constraint pedido_items_estado_recepcion_check CHECK ((estado_recepcion = ANY (ARRAY['Pendiente de recibir'::text, 'Recibido parcial'::text, 'Recibido'::text, 'Anulado'::text])))
);

create table public.pedidos (
  id uuid default gen_random_uuid() not null,
  numero_app text default generar_numero_app() not null,
  numero_tecmelec text,
  usuario_id uuid not null,
  comprador_id uuid,
  responsable_id uuid,
  estado_id integer default 1 not null,
  fecha_estimada_entrega date,
  nombre_contacto text,
  telefono_contacto text,
  direccion_entrega_id uuid,
  fecha_requerida date,
  total_estimado numeric(10,2) default 0,
  requiere_aprobacion boolean default false not null,
  aprobado boolean,
  aprobado_por uuid,
  aprobado_en timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  proyecto_id uuid,
  estado_general text default 'Pendiente de tramitar'::text not null,
  seguir_pedido boolean default false not null,
  constraint pedidos_numero_app_key UNIQUE (numero_app),
  constraint pedidos_pkey PRIMARY KEY (id),
  constraint pedidos_estado_general_check CHECK ((estado_general = ANY (ARRAY['Pendiente de tramitar'::text, 'Tramitado'::text, 'Tramitado parcial'::text, 'Anulado'::text])))
);

create table public.productos (
  id uuid default gen_random_uuid() not null,
  nombre text not null,
  descripcion text,
  imagen_url text,
  categoria text,
  precio numeric(10,2) default 0 not null,
  visible boolean default true not null,
  created_at timestamp with time zone default now() not null,
  bc_item_no text,
  unidad_medida text,
  proveedor_predeterminado_id uuid,
  multiplo_compra integer default 1 not null,
  constraint productos_bc_item_no_key UNIQUE (bc_item_no),
  constraint productos_pkey PRIMARY KEY (id),
  constraint productos_multiplo_compra_check CHECK ((multiplo_compra >= 1))
);

create table public.profiles (
  id uuid not null,
  nombre_completo text not null,
  email text not null,
  telefono text,
  rol text not null,
  comprador_id uuid,
  responsable_id uuid,
  created_at timestamp with time zone default now() not null,
  sustituto_id uuid,
  sustituto_activo boolean default false not null,
  bc_user_id uuid,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_rol_check CHECK ((rol = ANY (ARRAY['admin'::text, 'usuario'::text, 'comprador'::text, 'responsable'::text, 'almacen'::text])))
);

create table public.proveedores (
  id uuid default gen_random_uuid() not null,
  bc_proveedor_no text not null,
  nombre text,
  created_at timestamp with time zone default now() not null,
  constraint proveedores_bc_proveedor_no_key UNIQUE (bc_proveedor_no),
  constraint proveedores_pkey PRIMARY KEY (id)
);

create table public.proyectos (
  id uuid default gen_random_uuid() not null,
  bc_job_no text not null,
  descripcion text,
  estado text,
  created_at timestamp with time zone default now() not null,
  direccion text,
  codigo_postal text,
  ciudad text,
  provincia text,
  constraint proyectos_bc_job_no_key UNIQUE (bc_job_no),
  constraint proyectos_pkey PRIMARY KEY (id)
);

create table public.secuencias_numero_app (
  anio integer not null,
  ultimo integer default 0 not null,
  constraint secuencias_numero_app_pkey PRIMARY KEY (anio)
);

create table public.seguimiento_pedidos_tecmelec (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  numero_tecmelec text not null,
  usuario_id uuid not null,
  activo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint seguimiento_pedidos_tecmelec_pedido_id_numero_tecmelec_key UNIQUE (pedido_id, numero_tecmelec),
  constraint seguimiento_pedidos_tecmelec_pkey PRIMARY KEY (id)
);

create table public.usuario_proyectos (
  usuario_id uuid not null,
  proyecto_id uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint usuario_proyectos_pkey PRIMARY KEY (usuario_id, proyecto_id)
);

-- ---------- Claves ajenas ----------
alter table public.contactos_email_ocultos add constraint contactos_email_ocultos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.direcciones add constraint direcciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.enlaces_proveedor_pedido add constraint enlaces_proveedor_pedido_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES profiles(id);
alter table public.enlaces_proveedor_pedido add constraint enlaces_proveedor_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
alter table public.favoritos add constraint favoritos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE;
alter table public.favoritos add constraint favoritos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notificaciones add constraint notificaciones_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
alter table public.notificaciones add constraint notificaciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.pedido_compra_pdf_enviado add constraint pedido_compra_pdf_enviado_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id);
alter table public.pedido_compra_pdf_enviado add constraint pedido_compra_pdf_enviado_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
alter table public.pedido_emails add constraint pedido_emails_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES profiles(id);
alter table public.pedido_emails add constraint pedido_emails_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
alter table public.pedido_items add constraint pedido_items_estado_id_fkey FOREIGN KEY (estado_id) REFERENCES estados_pedido(id);
alter table public.pedido_items add constraint pedido_items_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
alter table public.pedido_items add constraint pedido_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id);
alter table public.pedido_items add constraint pedido_items_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores(id);
alter table public.pedidos add constraint pedidos_aprobado_por_fkey FOREIGN KEY (aprobado_por) REFERENCES profiles(id);
alter table public.pedidos add constraint pedidos_comprador_id_fkey FOREIGN KEY (comprador_id) REFERENCES profiles(id);
alter table public.pedidos add constraint pedidos_direccion_entrega_id_fkey FOREIGN KEY (direccion_entrega_id) REFERENCES direcciones(id);
alter table public.pedidos add constraint pedidos_estado_id_fkey FOREIGN KEY (estado_id) REFERENCES estados_pedido(id);
alter table public.pedidos add constraint pedidos_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id);
alter table public.pedidos add constraint pedidos_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES profiles(id);
alter table public.pedidos add constraint pedidos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id);
alter table public.productos add constraint productos_proveedor_predeterminado_id_fkey FOREIGN KEY (proveedor_predeterminado_id) REFERENCES proveedores(id);
alter table public.profiles add constraint profiles_comprador_id_fkey FOREIGN KEY (comprador_id) REFERENCES profiles(id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES profiles(id);
alter table public.profiles add constraint profiles_sustituto_id_fkey FOREIGN KEY (sustituto_id) REFERENCES profiles(id);
alter table public.seguimiento_pedidos_tecmelec add constraint seguimiento_pedidos_tecmelec_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
alter table public.seguimiento_pedidos_tecmelec add constraint seguimiento_pedidos_tecmelec_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.usuario_proyectos add constraint usuario_proyectos_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public.usuario_proyectos add constraint usuario_proyectos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ---------- Índices ----------
CREATE UNIQUE INDEX pedido_emails_token_idx ON public.pedido_emails USING btree (token);
CREATE INDEX pedido_emails_pedido_id_idx ON public.pedido_emails USING btree (pedido_id);
CREATE INDEX pedido_emails_numero_tecmelec_idx ON public.pedido_emails USING btree (numero_tecmelec);
CREATE INDEX enlaces_proveedor_pedido_numero_tecmelec_idx ON public.enlaces_proveedor_pedido USING btree (numero_tecmelec);
CREATE INDEX notificaciones_usuario_no_leidas ON public.notificaciones USING btree (usuario_id, leido, created_at DESC);

-- ---------- Triggers ----------
CREATE TRIGGER pedidos_notificar_cambio AFTER UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION trigger_notificar_cambio_pedido();
CREATE TRIGGER pedido_items_notificar_cambio AFTER UPDATE ON public.pedido_items FOR EACH ROW EXECUTE FUNCTION trigger_notificar_cambio_item();
CREATE TRIGGER pedidos_aprobado_subir_lineas AFTER UPDATE OF aprobado ON public.pedidos FOR EACH ROW EXECUTE FUNCTION trg_pedidos_aprobado_subir_lineas();
CREATE TRIGGER pedido_items_estado_si_aprobado BEFORE INSERT ON public.pedido_items FOR EACH ROW EXECUTE FUNCTION trg_pedido_items_estado_si_aprobado();

-- ---------- Permisos de ejecución de funciones (igual que en la base real) ----------
revoke all on function public.aprobar_solicitud_con_cambios(uuid, jsonb) from public, anon;
revoke all on function public.marcar_pdf_enviado(text, boolean) from public, anon;
revoke all on function public.notificar_cambio_estado_pedido(uuid, text) from public, anon, authenticated;
revoke all on function public.subir_lineas_a_solicitud_aprobada(uuid) from public, anon, authenticated;
revoke all on function public.trigger_notificar_cambio_item() from public, anon, authenticated;
revoke all on function public.trigger_notificar_cambio_pedido() from public, anon, authenticated;
grant execute on function public.aprobar_solicitud_con_cambios(uuid, jsonb) to authenticated;
grant execute on function public.marcar_pdf_enviado(text, boolean) to authenticated;

-- ---------- Seguridad a nivel de fila (RLS) ----------
alter table public.configuracion enable row level security;
alter table public.contactos_email_ocultos enable row level security;
alter table public.direcciones enable row level security;
alter table public.enlaces_proveedor_pedido enable row level security;
alter table public.estados_pedido enable row level security;
alter table public.favoritos enable row level security;
alter table public.notificaciones enable row level security;
alter table public.pedido_compra_pdf_enviado enable row level security;
alter table public.pedido_emails enable row level security;
alter table public.pedido_items enable row level security;
alter table public.pedidos enable row level security;
alter table public.productos enable row level security;
alter table public.profiles enable row level security;
alter table public.proveedores enable row level security;
alter table public.proyectos enable row level security;
alter table public.secuencias_numero_app enable row level security;
alter table public.seguimiento_pedidos_tecmelec enable row level security;
alter table public.usuario_proyectos enable row level security;

create policy "admin edita configuracion" on public.configuracion as permissive for update to public
  using ((get_my_role() = 'admin'::text));
create policy "ver configuracion" on public.configuracion as permissive for select to public
  using ((auth.role() = 'authenticated'::text));

create policy "usuario actualiza sus contactos ocultos" on public.contactos_email_ocultos as permissive for update to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));
create policy "usuario borra sus contactos ocultos" on public.contactos_email_ocultos as permissive for delete to public
  using ((usuario_id = auth.uid()));
create policy "usuario oculta sus contactos" on public.contactos_email_ocultos as permissive for insert to public
  with check ((usuario_id = auth.uid()));
create policy "usuario ve sus contactos ocultos" on public.contactos_email_ocultos as permissive for select to public
  using ((usuario_id = auth.uid()));

create policy "admin gestiona direcciones" on public.direcciones as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "comprador ve direcciones de sus asignados" on public.direcciones as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = direcciones.usuario_id) AND ((p.comprador_id = auth.uid()) OR es_sustituto_de(p.comprador_id))))));
create policy "responsable ve direcciones de sus asignados" on public.direcciones as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = direcciones.usuario_id) AND ((p.responsable_id = auth.uid()) OR es_sustituto_de(p.responsable_id))))));
create policy "usuario borra sus direcciones" on public.direcciones as permissive for delete to public
  using ((usuario_id = auth.uid()));
create policy "usuario crea sus direcciones" on public.direcciones as permissive for insert to public
  with check ((usuario_id = auth.uid()));
create policy "usuario edita sus direcciones" on public.direcciones as permissive for update to public
  using ((usuario_id = auth.uid()));
create policy "usuario ve sus direcciones" on public.direcciones as permissive for select to public
  using ((usuario_id = auth.uid()));

create policy "admin gestiona estados" on public.estados_pedido as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "ver estados" on public.estados_pedido as permissive for select to public
  using ((auth.role() = 'authenticated'::text));

create policy "admin ve todos los favoritos" on public.favoritos as permissive for select to public
  using ((get_my_role() = 'admin'::text));
create policy "usuario gestiona sus favoritos" on public.favoritos as permissive for all to public
  using ((usuario_id = auth.uid()));

create policy "usuario marca sus notificaciones" on public.notificaciones as permissive for update to public
  using ((usuario_id = auth.uid()))
  with check ((usuario_id = auth.uid()));
create policy "usuario ve sus notificaciones" on public.notificaciones as permissive for select to public
  using ((usuario_id = auth.uid()));

create policy "admin gestiona pdf enviado" on public.pedido_compra_pdf_enviado as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "ver pdf enviado de pedidos accesibles" on public.pedido_compra_pdf_enviado as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = pedido_compra_pdf_enviado.pedido_id) AND ((p.usuario_id = auth.uid()) OR (p.comprador_id = auth.uid()) OR es_sustituto_de(p.comprador_id) OR (p.responsable_id = auth.uid()) OR es_sustituto_de(p.responsable_id))))) OR (get_my_role() = 'admin'::text)));

create policy "admin gestiona emails" on public.pedido_emails as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "comprador registra emails de sus asignados" on public.pedido_emails as permissive for insert to public
  with check (((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = pedido_emails.pedido_id) AND ((p.comprador_id = auth.uid()) OR es_sustituto_de(p.comprador_id))))) OR (get_my_role() = 'admin'::text)));
create policy "ver emails de pedidos accesibles" on public.pedido_emails as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = pedido_emails.pedido_id) AND ((p.usuario_id = auth.uid()) OR (p.comprador_id = auth.uid()) OR es_sustituto_de(p.comprador_id) OR (p.responsable_id = auth.uid()) OR es_sustituto_de(p.responsable_id))))) OR (get_my_role() = 'admin'::text)));

create policy "admin gestiona items" on public.pedido_items as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "comprador actualiza items de sus asignados" on public.pedido_items as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = pedido_items.pedido_id) AND ((p.comprador_id = auth.uid()) OR es_sustituto_de(p.comprador_id))))));
create policy "usuario crea items de su pedido" on public.pedido_items as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = pedido_items.pedido_id) AND (p.usuario_id = auth.uid())))));
create policy "ver items de pedidos accesibles" on public.pedido_items as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = pedido_items.pedido_id) AND ((p.usuario_id = auth.uid()) OR (p.comprador_id = auth.uid()) OR es_sustituto_de(p.comprador_id) OR (p.responsable_id = auth.uid()) OR es_sustituto_de(p.responsable_id))))) OR (get_my_role() = 'admin'::text)));

create policy "admin gestiona pedidos" on public.pedidos as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "comprador actualiza sus asignados" on public.pedidos as permissive for update to public
  using (((comprador_id = auth.uid()) OR es_sustituto_de(comprador_id)));
create policy "comprador ve sus asignados" on public.pedidos as permissive for select to public
  using (((comprador_id = auth.uid()) OR es_sustituto_de(comprador_id)));
create policy "responsable aprueba sus asignados" on public.pedidos as permissive for update to public
  using (((responsable_id = auth.uid()) OR es_sustituto_de(responsable_id)));
create policy "responsable ve sus asignados" on public.pedidos as permissive for select to public
  using (((responsable_id = auth.uid()) OR es_sustituto_de(responsable_id)));
create policy "usuario crea sus pedidos" on public.pedidos as permissive for insert to public
  with check ((usuario_id = auth.uid()));
create policy "usuario ve sus pedidos" on public.pedidos as permissive for select to public
  using ((usuario_id = auth.uid()));

create policy "admin gestiona productos" on public.productos as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "ver productos visibles" on public.productos as permissive for select to public
  using (((visible = true) OR (get_my_role() = 'admin'::text)));

create policy "admin gestiona perfiles" on public.profiles as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "comprador ve perfiles de sus asignados" on public.profiles as permissive for select to public
  using (((comprador_id = auth.uid()) OR es_sustituto_de(comprador_id)));
create policy "responsable ve lista de compradores" on public.profiles as permissive for select to public
  using (((rol = 'comprador'::text) AND (get_my_role() = 'responsable'::text)));
create policy "responsable ve perfiles de sus asignados" on public.profiles as permissive for select to public
  using (((responsable_id = auth.uid()) OR es_sustituto_de(responsable_id)));
create policy "usuario ve su comprador asignado" on public.profiles as permissive for select to public
  using ((id = get_my_comprador_id()));
create policy "usuario ve sustituto de su comprador" on public.profiles as permissive for select to public
  using ((id = get_sustituto_de_mi_comprador()));
create policy "ver propio perfil" on public.profiles as permissive for select to public
  using (((id = auth.uid()) OR (get_my_role() = 'admin'::text)));

create policy "admin gestiona proveedores" on public.proveedores as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "ver proveedores" on public.proveedores as permissive for select to public
  using ((auth.role() = 'authenticated'::text));

create policy "admin gestiona proyectos" on public.proyectos as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "ver proyectos" on public.proyectos as permissive for select to public
  using ((auth.role() = 'authenticated'::text));

create policy "usuario ve su seguimiento" on public.seguimiento_pedidos_tecmelec as permissive for select to public
  using ((usuario_id = auth.uid()));

create policy "admin gestiona asignaciones" on public.usuario_proyectos as permissive for all to public
  using ((get_my_role() = 'admin'::text));
create policy "responsable gestiona asignaciones de su equipo" on public.usuario_proyectos as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = usuario_proyectos.usuario_id) AND (p.responsable_id = auth.uid())))));
create policy "usuario ve sus proyectos asignados" on public.usuario_proyectos as permissive for select to public
  using ((usuario_id = auth.uid()));

-- ---------- Realtime (campana de notificaciones) ----------
alter publication supabase_realtime add table public.notificaciones;
alter publication supabase_realtime add table public.seguimiento_pedidos_tecmelec;

-- ---------- Storage: imágenes de productos ----------
insert into storage.buckets (id, name, public) values ('productos', 'productos', true)
on conflict (id) do nothing;

create policy "admin actualiza imagenes productos" on storage.objects as permissive for update to public
  using (((bucket_id = 'productos'::text) AND (public.get_my_role() = 'admin'::text)));
create policy "admin borra imagenes productos" on storage.objects as permissive for delete to public
  using (((bucket_id = 'productos'::text) AND (public.get_my_role() = 'admin'::text)));
create policy "admin sube imagenes productos" on storage.objects as permissive for insert to public
  with check (((bucket_id = 'productos'::text) AND (public.get_my_role() = 'admin'::text)));
