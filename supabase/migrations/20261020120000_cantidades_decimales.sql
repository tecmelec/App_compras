-- Cantidades con decimales (hasta 3, p. ej. 10,5 m de cable) en las líneas de solicitud.
alter table public.pedido_items
  alter column cantidad type numeric(14,3) using cantidad::numeric,
  alter column cantidad_original type numeric(14,3) using cantidad_original::numeric,
  alter column cantidad_aprobador type numeric(14,3) using cantidad_aprobador::numeric,
  alter column cantidad_antes_bc type numeric(14,3) using cantidad_antes_bc::numeric;

-- La aprobación con cambios leía la cantidad como entero: se adapta la versión
-- instalada (sea cual sea) para que admita decimales.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.aprobar_solicitud_con_cambios(uuid, jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def, 'v_cantidad integer;', 'v_cantidad numeric;');
  v_def := replace(v_def, '(v_linea->>''cantidad'')::integer', '(v_linea->>''cantidad'')::numeric');
  execute v_def;
end $$;
