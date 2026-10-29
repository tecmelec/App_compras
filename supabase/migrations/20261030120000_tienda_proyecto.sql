-- "Tienda por proyecto": materiales autorizados por obra con cantidad máxima, cantidad
-- inicial (consumo previo no reflejado en la app), ampliaciones e historial de cambios.
-- Todo el acceso se hace desde el servidor (cliente admin) con las comprobaciones de
-- permisos en el código: RLS activada y sin políticas para los usuarios.

-- Cantidad recibida de cada línea (Quantity_Received de la línea de compra de BC), para
-- la barra de consumo. Se rellena en la sincronización con BC.
alter table public.pedido_items add column if not exists cantidad_recibida numeric(14,3);

-- Exceso sobre la tienda del proyecto:
--   ampliacion_tienda: cantidad de esta línea que se autorizó como ampliación.
--   ampliacion_tienda_pendiente: exceso pedido por quien no puede autorizarlo; el
--   aprobador debe reducir la cantidad o aprobar la ampliación.
alter table public.pedido_items add column if not exists ampliacion_tienda numeric(14,3);
alter table public.pedido_items add column if not exists ampliacion_tienda_pendiente numeric(14,3);

create table if not exists public.tienda_proyecto_articulos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  cantidad_maxima numeric(14,3) not null check (cantidad_maxima > 0),
  cantidad_inicial numeric(14,3) not null default 0 check (cantidad_inicial >= 0),
  -- Suma de las ampliaciones (el límite es cantidad_maxima + cantidad_ampliada).
  cantidad_ampliada numeric(14,3) not null default 0 check (cantidad_ampliada >= 0),
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proyecto_id, producto_id)
);
create index if not exists tienda_proyecto_articulos_proyecto_idx on public.tienda_proyecto_articulos (proyecto_id);

create table if not exists public.tienda_proyecto_historial (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.tienda_proyecto_articulos(id) on delete cascade,
  tipo text not null check (tipo in ('alta', 'cantidad_maxima', 'cantidad_inicial', 'ampliacion')),
  valor_anterior numeric(14,3),
  valor_nuevo numeric(14,3),
  -- Ampliación: cantidad ampliada (y la solicitud que la motivó, si la hay).
  cantidad numeric(14,3),
  pedido_id uuid references public.pedidos(id) on delete set null,
  numero_app text,
  comentario text,
  usuario_id uuid references public.profiles(id) on delete set null,
  usuario_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists tienda_proyecto_historial_articulo_idx on public.tienda_proyecto_historial (articulo_id, created_at);

alter table public.tienda_proyecto_articulos enable row level security;
alter table public.tienda_proyecto_historial enable row level security;
