-- Permite que un comprador vea el perfil (nombre) de los usuarios que tiene asignados
create policy "comprador ve perfiles de sus asignados" on public.profiles
  for select using (comprador_id = auth.uid());

-- Permite que un responsable vea el perfil (nombre) de los usuarios que tiene asignados
create policy "responsable ve perfiles de sus asignados" on public.profiles
  for select using (responsable_id = auth.uid());
