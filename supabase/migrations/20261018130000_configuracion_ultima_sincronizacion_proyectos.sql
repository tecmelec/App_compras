-- Fecha y hora de la última sincronización de proyectos con BC (Admin → Proyectos) y quién la lanzó.
alter table public.configuracion add column if not exists ultima_sincronizacion_proyectos timestamptz;
alter table public.configuracion add column if not exists ultima_sincronizacion_proyectos_por text;
