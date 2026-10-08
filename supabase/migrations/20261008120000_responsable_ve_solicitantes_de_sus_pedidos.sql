-- El aprobador de una solicitud puede ser el jefe de obra del proyecto (BC), que no
-- tiene por qué ser el responsable asignado del solicitante. Con las políticas
-- anteriores no podía leer el perfil del solicitante y su nombre salía como "—".
-- Esta política le deja ver los perfiles de quienes le han enviado solicitudes.
--
-- Se usa una función security definer para no consultar "pedidos" desde la política
-- de "profiles" con RLS (evita recursión entre políticas).

create or replace function public.es_solicitante_de_mis_pedidos(p_usuario_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.pedidos p
    where p.usuario_id = p_usuario_id
      and (p.responsable_id = auth.uid() or public.es_sustituto_de(p.responsable_id))
  );
$function$;

drop policy if exists "responsable ve solicitantes de sus pedidos" on public.profiles;
create policy "responsable ve solicitantes de sus pedidos" on public.profiles
  as permissive for select to public
  using (public.es_solicitante_de_mis_pedidos(id));
