-- "Solicitar alta de artículos": compradores, responsables y admin piden que
-- un artículo de Business Central se publique en la Tienda. El admin ve todas
-- las solicitudes y les asigna el estado.
create table if not exists public.solicitudes_alta_articulo (
  id uuid primary key default gen_random_uuid(),
  bc_item_no text not null,
  descripcion text not null,
  solicitado_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  estado text not null default 'Solicitud enviada'
    check (estado in ('Solicitud enviada', 'Rechazada', 'Disponible en tienda')),
  gestionado_por uuid references public.profiles(id) on delete set null,
  gestionado_en timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists solicitudes_alta_articulo_solicitante_idx on public.solicitudes_alta_articulo (solicitado_por);
create index if not exists solicitudes_alta_articulo_item_idx on public.solicitudes_alta_articulo (bc_item_no);

alter table public.solicitudes_alta_articulo enable row level security;

-- Crear: compradores, responsables y admin, siempre a su nombre y en estado inicial.
drop policy if exists "crear solicitud de alta" on public.solicitudes_alta_articulo;
create policy "crear solicitud de alta" on public.solicitudes_alta_articulo
  for insert with check (
    solicitado_por = auth.uid()
    and estado = 'Solicitud enviada'
    and coalesce(public.get_my_role(), '') in ('comprador', 'responsable', 'admin')
  );

-- Ver: cada uno las suyas; el admin, todas.
drop policy if exists "ver solicitudes de alta" on public.solicitudes_alta_articulo;
create policy "ver solicitudes de alta" on public.solicitudes_alta_articulo
  for select using (solicitado_por = auth.uid() or coalesce(public.get_my_role(), '') = 'admin');

-- Cambiar el estado: solo el admin.
drop policy if exists "admin gestiona solicitudes de alta" on public.solicitudes_alta_articulo;
create policy "admin gestiona solicitudes de alta" on public.solicitudes_alta_articulo
  for update using (coalesce(public.get_my_role(), '') = 'admin');

-- Notificación (campana) al solicitante cuando el admin pasa la solicitud a
-- "Disponible en tienda" o "Rechazada".
-- Las notificaciones dejan de estar ligadas siempre a una solicitud de
-- material: pedido_id pasa a ser opcional y "enlace" indica a dónde llevan.
alter table public.notificaciones alter column pedido_id drop not null;
alter table public.notificaciones add column if not exists enlace text;

create or replace function public.notificar_cambio_solicitud_alta()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.estado is distinct from old.estado and new.estado in ('Disponible en tienda', 'Rechazada') then
    insert into public.notificaciones (usuario_id, pedido_id, numero_app, mensaje, enlace)
    values (
      new.solicitado_por,
      null,
      null,
      case new.estado
        when 'Disponible en tienda' then 'El artículo ' || new.bc_item_no || ' — ' || new.descripcion || ' ya está disponible en la tienda.'
        else 'Tu solicitud de alta del artículo ' || new.bc_item_no || ' — ' || new.descripcion || ' ha sido rechazada.'
      end,
      '/alta-articulos'
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists solicitudes_alta_articulo_notificar on public.solicitudes_alta_articulo;
create trigger solicitudes_alta_articulo_notificar
  after update of estado on public.solicitudes_alta_articulo
  for each row execute function public.notificar_cambio_solicitud_alta();
