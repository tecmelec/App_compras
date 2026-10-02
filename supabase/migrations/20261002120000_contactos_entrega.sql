-- Contactos de entrega guardados por cada usuario (paso "Persona de contacto"
-- de la solicitud). Por defecto se propone el propio usuario (nombre y
-- teléfono de su perfil); aquí se guardan los contactos adicionales.
-- Las solicitudes copian nombre y teléfono como texto (pedidos.nombre_contacto
-- / telefono_contacto), así que borrar un contacto no afecta a solicitudes ya hechas.
create table if not exists public.contactos_entrega (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text not null check (length(trim(telefono)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists contactos_entrega_usuario_idx on public.contactos_entrega (usuario_id);

alter table public.contactos_entrega enable row level security;

drop policy if exists "usuario gestiona sus contactos de entrega" on public.contactos_entrega;
create policy "usuario gestiona sus contactos de entrega" on public.contactos_entrega
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
