-- Fecha y hora de la última sincronización masiva con BC (cron nocturno o botón
-- "Sincronizar todas con Business Central"), y quién la lanzó ("automática" si fue el cron).
alter table public.configuracion add column if not exists ultima_sincronizacion_bc timestamptz;
alter table public.configuracion add column if not exists ultima_sincronizacion_bc_por text;
