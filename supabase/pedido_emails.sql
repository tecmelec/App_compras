-- Registro de los emails de pedido de compra enviados desde la app (vía
-- Microsoft Graph), para poder mostrar un historial/conversación por pedido.
-- Ejecutar en el SQL Editor del proyecto "Portal Compras" de Supabase.

create table public.pedido_emails (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  numero_tecmelec text not null,
  enviado_por uuid not null references public.profiles(id),
  buzon text not null,
  destinatarios text[] not null,
  asunto text not null,
  mensaje text not null,
  con_fotos boolean not null default false,
  graph_message_id text,
  graph_conversation_id text,
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create unique index pedido_emails_token_idx on public.pedido_emails(token);

create index pedido_emails_pedido_id_idx on public.pedido_emails(pedido_id);
create index pedido_emails_numero_tecmelec_idx on public.pedido_emails(numero_tecmelec);

alter table public.pedido_emails enable row level security;

create policy "ver emails de pedidos accesibles" on public.pedido_emails
  for select using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
      and (
        p.usuario_id = auth.uid()
        or p.comprador_id = auth.uid() or public.es_sustituto_de(p.comprador_id)
        or p.responsable_id = auth.uid() or public.es_sustituto_de(p.responsable_id)
      )
    ) or public.get_my_role() = 'admin'
  );

create policy "comprador registra emails de sus asignados" on public.pedido_emails
  for insert with check (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
      and (p.comprador_id = auth.uid() or public.es_sustituto_de(p.comprador_id))
    ) or public.get_my_role() = 'admin'
  );

create policy "admin gestiona emails" on public.pedido_emails
  for all using (public.get_my_role() = 'admin');
