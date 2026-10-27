-- Nuevo perfil "integral" (responsable + comprador de sus propias solicitudes).
-- Como no es "comprador", es_comprador() sigue siendo falso para él: solo ve las
-- solicitudes que crea, tiene asignadas como comprador o aprueba (políticas existentes).
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol = any (array['admin'::text, 'usuario'::text, 'comprador'::text, 'responsable'::text, 'almacen'::text, 'integral'::text]));

-- Solicitar alta de artículos: también el perfil integral.
drop policy if exists "crear solicitud de alta" on public.solicitudes_alta_articulo;
create policy "crear solicitud de alta" on public.solicitudes_alta_articulo
  for insert with check (
    solicitado_por = auth.uid()
    and estado = 'Solicitud enviada'
    and coalesce(public.get_my_role(), '') in ('comprador', 'responsable', 'admin', 'integral')
  );
