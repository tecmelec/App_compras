-- Sincronización automática de PROYECTOS con BC dos veces al día: 9:15 y 14:15 (hora de
-- Madrid), todos los días. Igual que la de pedidos (20261016130000): Supabase pg_cron +
-- pg_net llama a /api/cron/sincronizar-proyectos-bc con la misma clave CRON_SECRET,
-- guardada ya en Vault como 'cron_secret_sincronizar_bc'.
--
-- SOLO EN EL SUPABASE DE PRODUCCIÓN.

create or replace function public.lanzar_sincronizacion_proyectos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  secreto text;
begin
  -- pg_cron trabaja en UTC: se programa a las 7:15, 8:15, 12:15 y 13:15 UTC y aquí solo
  -- se ejecuta la que corresponde a las 9:15 o las 14:15 de Madrid (verano o invierno).
  if not ((extract(hour from ahora) in (9, 14)) and extract(minute from ahora) between 10 and 25) then
    return;
  end if;

  select decrypted_secret into secreto
  from vault.decrypted_secrets
  where name = 'cron_secret_sincronizar_bc';
  if secreto is null then
    raise warning 'lanzar_sincronizacion_proyectos: falta el secreto cron_secret_sincronizar_bc en Vault';
    return;
  end if;

  perform net.http_get(
    url := 'https://comprastecmelec.vercel.app/api/cron/sincronizar-proyectos-bc',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secreto),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.lanzar_sincronizacion_proyectos() from public, anon, authenticated;

select cron.unschedule('sincronizar-proyectos-bc')
where exists (select 1 from cron.job where jobname = 'sincronizar-proyectos-bc');

select cron.schedule(
  'sincronizar-proyectos-bc',
  '15 7,8,12,13 * * *',
  $$select public.lanzar_sincronizacion_proyectos();$$
);

-- Comprobaciones:
--   select * from cron.job where jobname = 'sincronizar-proyectos-bc';
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Para desactivarla:  select cron.unschedule('sincronizar-proyectos-bc');
