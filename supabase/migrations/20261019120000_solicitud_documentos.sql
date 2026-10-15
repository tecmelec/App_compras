-- Documentos adjuntos a una solicitud (planos, presupuestos, fichas técnicas, fotos...):
-- se adjuntan en el carrito (todos los perfiles excepto "usuario") y acompañan a la
-- solicitud para facilitar la compra y la asignación de precios. Se suben directamente
-- al bucket privado "documentos-solicitud" con una URL de subida firmada y se vinculan a
-- la solicitud al enviarla (pedido_id). La escritura se hace desde el servidor con la
-- service role; las páginas de detalle comprueban antes el acceso a la solicitud.
create table if not exists public.solicitud_documentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id),
  pedido_id uuid references public.pedidos(id) on delete cascade,
  ruta text not null,
  nombre text not null,
  tipo text,
  tamano bigint,
  created_at timestamptz not null default now()
);
create index if not exists solicitud_documentos_pedido_id_idx on public.solicitud_documentos (pedido_id);
create index if not exists solicitud_documentos_usuario_id_idx on public.solicitud_documentos (usuario_id);

alter table public.solicitud_documentos enable row level security;
drop policy if exists "usuario ve sus documentos" on public.solicitud_documentos;
create policy "usuario ve sus documentos" on public.solicitud_documentos
  as permissive for select to public
  using (usuario_id = auth.uid());

-- Bucket privado (los archivos se sirven con URL firmada de 1 hora). Máximo 25 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos-solicitud', 'documentos-solicitud', false, 26214400)
on conflict (id) do nothing;
