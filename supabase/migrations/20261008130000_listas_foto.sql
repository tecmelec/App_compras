-- Carrito desde foto: cada foto de una lista de materiales escrita, su análisis
-- (líneas leídas, artículo propuesto, cantidad) y lo que el usuario decidió al
-- revisarla. Se vincula a la solicitud al enviarla (pedido_id) para mostrar la foto
-- y el informe en el detalle. Toda la escritura se hace desde el servidor con la
-- service role; los usuarios solo pueden leer sus propias listas.

create table if not exists public.listas_foto (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id),
  imagen_path text not null,
  lineas jsonb not null default '[]'::jsonb,
  pedido_id uuid references public.pedidos(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists listas_foto_pedido_id_idx on public.listas_foto (pedido_id);
create index if not exists listas_foto_usuario_id_idx on public.listas_foto (usuario_id);

alter table public.listas_foto enable row level security;

drop policy if exists "usuario ve sus listas en foto" on public.listas_foto;
create policy "usuario ve sus listas en foto" on public.listas_foto
  as permissive for select to public
  using (usuario_id = auth.uid());

-- Bucket privado para las fotos (se sirven con URL firmada de 1 hora).
insert into storage.buckets (id, name, public)
values ('listas-foto', 'listas-foto', false)
on conflict (id) do nothing;
