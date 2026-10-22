-- Comprador IA — Fase 1, paso 3: peticiones de oferta a proveedores desde "Proponer
-- compra". Un email por proveedor (desde el buzón del comprador, con Microsoft Graph);
-- aquí queda registrado qué se pidió, a quién y cuándo.
create table if not exists public.peticiones_oferta (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  propuesta_compra_id uuid references public.propuestas_compra(id) on delete set null,
  proveedor_id uuid references public.proveedores(id),
  proveedor_nombre text,
  destinatarios text[] not null default '{}',
  cc text[] not null default '{}',
  asunto text not null,
  cuerpo text not null,
  item_ids uuid[] not null default '{}',
  lineas jsonb not null default '[]'::jsonb,
  sugerido boolean not null default true, -- false si el comprador añadió el proveedor a mano
  enviado_por uuid references public.profiles(id),
  enviado_en timestamptz not null default now(),
  message_id text,
  conversation_id text
);
create index if not exists peticiones_oferta_pedido_id_idx on public.peticiones_oferta (pedido_id);
alter table public.peticiones_oferta enable row level security;
-- Sin políticas: solo se lee y escribe desde el servidor (service role).
