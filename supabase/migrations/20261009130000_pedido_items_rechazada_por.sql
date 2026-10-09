-- Quién rechazó una línea cuando no es el aprobador al aprobar con cambios (p. ej.
-- Compras o el responsable desde el informe de la lista de materiales). Si están
-- vacías, la rechazó el aprobador.
alter table public.pedido_items add column if not exists rechazada_por_nombre text;
alter table public.pedido_items add column if not exists rechazada_por_rol text;
