-- Cambia el formato de "Nº pedido APP" de APP-000001 (secuencia global)
-- a APP-AA00001, donde AA son los 2 últimos dígitos del año en curso y
-- el correlativo (5 dígitos) empieza de nuevo en 00001 cada año.
--
-- Ejemplos: 2026 -> APP-2600001, APP-2600002, APP-2600003...
--           2027 -> APP-2700001, APP-2700002...
--
-- Los pedidos ya existentes NO se renumeran (mantienen su numero_app
-- actual); esto solo afecta a los pedidos nuevos a partir de ahora.

create table if not exists public.secuencias_numero_app (
  anio int primary key,
  ultimo int not null default 0
);

create or replace function public.generar_numero_app()
returns text
language plpgsql
as $$
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
$$;

alter table public.pedidos
  alter column numero_app set default public.generar_numero_app();
