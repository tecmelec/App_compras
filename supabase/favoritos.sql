-- Favoritos de productos por usuario (para fijarlos primero en la tienda)
create table public.favoritos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, producto_id)
);

alter table public.favoritos enable row level security;

create policy "usuario gestiona sus favoritos" on public.favoritos
  for all using (usuario_id = auth.uid());

create policy "admin ve todos los favoritos" on public.favoritos
  for select using (public.get_my_role() = 'admin');
