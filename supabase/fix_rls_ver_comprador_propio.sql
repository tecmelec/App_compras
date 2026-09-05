-- Permite que un usuario vea el nombre de su comprador y responsable asignados
-- (antes solo el comprador/responsable podían ver al usuario, faltaba el sentido inverso)
create policy "usuario ve su comprador asignado" on public.profiles
  for select using (
    id = (select comprador_id from public.profiles where id = auth.uid())
  );

create policy "usuario ve su responsable asignado" on public.profiles
  for select using (
    id = (select responsable_id from public.profiles where id = auth.uid())
  );
