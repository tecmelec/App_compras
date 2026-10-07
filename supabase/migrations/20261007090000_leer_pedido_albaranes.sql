-- Alb. Tecmelec: lectura automática del Nº de pedido de compra en las fotos de
-- albaranes (tabla public.photo_ocr, bucket "Fotos albaranes").
-- La lectura la hace la Edge Function "leer-pedido-albaran" (Claude + reglas
-- PC26xxxxx / Saltoki). Aquí solo se programa cuándo se la llama:
--  - Al momento, cuando una foto queda con pedido_compra = 'Sin asignar'.
--  - Cada 15 minutos, un barrido de las pendientes de la última semana (por si
--    la foto aún no estaba subida o hubo un fallo puntual).
-- La llamada usa la clave pública (anon) del proyecto, igual que la PWA.

create or replace function public.photo_ocr_leer_pedido()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
begin
  if new.pedido_compra = 'Sin asignar'
     and (tg_op = 'INSERT' or old.pedido_compra is distinct from new.pedido_compra) then
    perform net.http_post(
      url := 'https://oappnsquhmgccjnlistx.supabase.co/functions/v1/leer-pedido-albaran',
      body := jsonb_build_object('file_name', new.file_name),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcHBuc3F1aG1nY2Nqbmxpc3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzE4NzUsImV4cCI6MjEwNDAwNzg3NX0.9HfLeP-Oz27qBW5OS3aMxh2edzXi6zaurImm4egKn8I'
      ),
      timeout_milliseconds := 60000
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists photo_ocr_leer_pedido on public.photo_ocr;
create trigger photo_ocr_leer_pedido
  after insert or update of pedido_compra on public.photo_ocr
  for each row execute function public.photo_ocr_leer_pedido();

-- Barrido cada 15 minutos (reprograma si ya existía).
select cron.unschedule('leer-pedido-albaranes')
where exists (select 1 from cron.job where jobname = 'leer-pedido-albaranes');

select cron.schedule(
  'leer-pedido-albaranes',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://oappnsquhmgccjnlistx.supabase.co/functions/v1/leer-pedido-albaran',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcHBuc3F1aG1nY2Nqbmxpc3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzE4NzUsImV4cCI6MjEwNDAwNzg3NX0.9HfLeP-Oz27qBW5OS3aMxh2edzXi6zaurImm4egKn8I'
    ),
    timeout_milliseconds := 120000
  )
  where exists (
    select 1 from public.photo_ocr
    where (pedido_compra is null or pedido_compra = 'Sin asignar')
      and created_at > now() - interval '7 days'
  );
  $cron$
);
