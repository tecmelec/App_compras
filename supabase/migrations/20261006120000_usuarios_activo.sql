-- Desactivar usuarios: conserva todo su historial pero le quita el acceso a la
-- Tienda. No afecta al CRM ni al almacén (comparten las cuentas de acceso).
alter table public.profiles add column if not exists activo boolean not null default true;

-- Un usuario desactivado pierde los permisos de su rol en la base de datos
-- (admin, comprador, responsable…), aunque conserve la sesión abierta.
create or replace function public.get_my_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select rol from public.profiles where id = auth.uid() and activo;
$function$;
