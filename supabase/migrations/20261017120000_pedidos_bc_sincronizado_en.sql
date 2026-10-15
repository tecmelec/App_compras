-- Última vez que la sincronización automática con BC procesó cada solicitud. El cron
-- procesa primero las que hace más tiempo que no se sincronizan y, si no le da tiempo
-- a todas en los 60 s del servidor, la siguiente ejecución sigue por donde se quedó.
alter table public.pedidos add column if not exists bc_sincronizado_en timestamptz;
