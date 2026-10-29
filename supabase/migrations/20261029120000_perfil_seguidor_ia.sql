-- Nuevo perfil "Seguidor IA": cuenta (agente) que actualiza las fechas estimadas de
-- entrega. Solo lee solicitudes y líneas (políticas de solo lectura); la modificación de
-- fechas se hace desde el servidor con una acción que solo toca la fecha.
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol = any (array['admin'::text, 'usuario'::text, 'comprador'::text, 'responsable'::text, 'almacen'::text, 'integral'::text, 'seguidor_ia'::text]));

create or replace function public.es_seguidor_ia()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') = 'seguidor_ia';
$function$;

-- Lectura (solo SELECT) de lo necesario para ver "Líns. compras", "Solicitudes por
-- comprar" y el detalle de una solicitud.
drop policy if exists "seguidor ia ve solicitudes" on public.pedidos;
create policy "seguidor ia ve solicitudes" on public.pedidos for select using (public.es_seguidor_ia());
drop policy if exists "seguidor ia ve lineas" on public.pedido_items;
create policy "seguidor ia ve lineas" on public.pedido_items for select using (public.es_seguidor_ia());
drop policy if exists "seguidor ia ve emails de pedidos" on public.pedido_emails;
create policy "seguidor ia ve emails de pedidos" on public.pedido_emails for select using (public.es_seguidor_ia());
drop policy if exists "seguidor ia ve marcas pdf enviado" on public.pedido_compra_pdf_enviado;
create policy "seguidor ia ve marcas pdf enviado" on public.pedido_compra_pdf_enviado for select using (public.es_seguidor_ia());
drop policy if exists "seguidor ia ve perfiles" on public.profiles;
create policy "seguidor ia ve perfiles" on public.profiles for select using (public.es_seguidor_ia());
drop policy if exists "seguidor ia ve direcciones" on public.direcciones;
create policy "seguidor ia ve direcciones" on public.direcciones for select using (public.es_seguidor_ia());

-- Confirmación de la fecha estimada por el Seguidor IA (check azul).
alter table public.pedido_items add column if not exists fecha_estimada_entrega_seguidor_en timestamptz;
