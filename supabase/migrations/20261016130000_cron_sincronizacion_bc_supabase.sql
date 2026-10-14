-- Sincronización automática con BC cada 30 minutos, de lunes a viernes, de 8:00 a 18:00
-- (hora de Madrid), programada desde Supabase (pg_cron + pg_net). El plan Hobby de
-- Vercel solo permite crons diarios; aquí Supabase llama a la misma ruta que el cron
-- nocturno de Vercel (/api/cron/sincronizar-pedidos-bc) con la clave CRON_SECRET.
--
-- SOLO EN EL SUPABASE DE PRODUCCIÓN (los crons de Vercel solo existen en producción).
--
-- Antes de ejecutar: sustituye PEGA_AQUI_EL_CRON_SECRET por el valor de la variable
-- CRON_SECRET de Vercel (Production). Queda guardado cifrado en Supabase Vault.

-- 1. Extensiones
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Clave secreta en Vault (si ya existe, se actualiza)
do $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'cron_secret_sincronizar_bc';
  if v_id is null then
    perform vault.create_secret('PEGA_AQUI_EL_CRON_SECRET', 'cron_secret_sincronizar_bc', 'CRON_SECRET de Vercel para /api/cron/sincronizar-pedidos-bc');
  else
    perform vault.update_secret(v_id, 'PEGA_AQUI_EL_CRON_SECRET');
  end if;
end $$;

-- 3. Función que lanza la sincronización. pg_cron trabaja en UTC; la franja horaria se
--    comprueba aquí en hora de Madrid, así no hay que tocar nada con el cambio de hora.
create or replace function public.lanzar_sincronizacion_bc()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  secreto text;
begin
  -- Lunes (1) a viernes (5), de 8:00 a 18:00 (la última, a las 18:00 en punto)
  if extract(isodow from ahora) > 5 then return; end if;
  if ahora::time < time '08:00' or ahora::time > time '18:05' then return; end if;

  select decrypted_secret into secreto
  from vault.decrypted_secrets
  where name = 'cron_secret_sincronizar_bc';
  if secreto is null then
    raise warning 'lanzar_sincronizacion_bc: falta el secreto cron_secret_sincronizar_bc en Vault';
    return;
  end if;

  perform net.http_get(
    url := 'https://comprastecmelec.vercel.app/api/cron/sincronizar-pedidos-bc',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secreto),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.lanzar_sincronizacion_bc() from public, anon, authenticated;

-- 4. Programación: cada 30 minutos entre las 5:00 y las 17:59 UTC (cubre 8:00–18:00 de
--    Madrid en horario de verano y de invierno); la función descarta lo que queda fuera.
select cron.unschedule('sincronizar-bc-cada-30-min')
where exists (select 1 from cron.job where jobname = 'sincronizar-bc-cada-30-min');

select cron.schedule(
  'sincronizar-bc-cada-30-min',
  '0,30 5-17 * * 1-5',
  $$select public.lanzar_sincronizacion_bc();$$
);

-- Comprobaciones útiles:
--   select * from cron.job;                                          -- tarea programada
--   select * from cron.job_run_details order by start_time desc limit 20;  -- ejecuciones
--   select id, status_code, created from net._http_response order by created desc limit 20;  -- respuestas de Vercel
-- Para desactivarla:  select cron.unschedule('sincronizar-bc-cada-30-min');
