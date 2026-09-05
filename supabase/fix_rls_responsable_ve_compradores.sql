-- Permite que un responsable vea los perfiles con rol "comprador",
-- para poder elegir uno al solicitar materiales.
-- Usa get_my_role() (función segura ya existente) en vez de una subconsulta
-- directa sobre profiles, para evitar el problema de recursión anterior.
create policy "responsable ve lista de compradores" on public.profiles
  for select using (
    rol = 'comprador' and public.get_my_role() = 'responsable'
  );
