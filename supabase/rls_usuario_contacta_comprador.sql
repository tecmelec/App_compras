-- Permite que un perfil "usuario" pueda leer el email y teléfono de su
-- comprador asignado (y el de su sustituto, si está activo), para el
-- bloque "Contactar" del menú lateral. Sin esto, RLS bloquea la consulta
-- y esos campos llegan vacíos aunque el dato exista en la tabla.

create or replace function public.get_my_comprador_id()
returns uuid language sql security definer stable as $$
  select comprador_id from public.profiles where id = auth.uid();
$$;

create or replace function public.get_sustituto_de_mi_comprador()
returns uuid language sql security definer stable as $$
  select sustituto_id from public.profiles
  where id = public.get_my_comprador_id() and sustituto_activo = true;
$$;

create policy "usuario ve su comprador asignado" on public.profiles
  for select using (id = public.get_my_comprador_id());

create policy "usuario ve sustituto de su comprador" on public.profiles
  for select using (id = public.get_sustituto_de_mi_comprador());
