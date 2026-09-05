-- Revertir el cambio anterior: estas políticas, al consultar la misma tabla profiles
-- dentro de su propia condición, parecen haber roto la consulta de perfil que usa
-- la app en cada carga de página, causando el loop de redirección login/tienda.
drop policy if exists "usuario ve su comprador asignado" on public.profiles;
drop policy if exists "usuario ve su responsable asignado" on public.profiles;
