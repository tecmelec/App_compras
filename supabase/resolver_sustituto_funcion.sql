-- Resuelve el sustituto activo de un comprador/responsable, sin depender
-- de los permisos de lectura de quien llama (evita el problema de RLS
-- cuando es un "usuario" quien crea el pedido).
create or replace function public.resolver_sustituto(id uuid)
returns uuid
language sql
security definer
stable
as $$
  select coalesce(
    (select sustituto_id from public.profiles
     where id = $1 and sustituto_activo = true and sustituto_id is not null),
    id
  );
$$;
