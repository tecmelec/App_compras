-- =====================================================================
-- LIMPIEZA DE LA BASE REAL ("Portal Compras", oappnsquhmgccjnlistx)
-- antes de arrancar con usuarios reales (02/10/2026).
--
-- Borra SOLO datos de prueba de la Tienda y 6 cuentas de prueba.
-- NO toca: catálogo (productos), proveedores, proyectos, estados,
-- configuración, ni ninguna tabla crm_* / almacen_* (salvo la ficha de
-- usuario del CRM de proveedores@tecmelec.es, que se borra con su cuenta
-- por decisión expresa; no tiene oportunidades ni actividades).
--
-- Todo va en una transacción: si algo falla, no se borra nada.
-- HACER ANTES una copia de seguridad (Database → Backups).
-- =====================================================================
begin;

-- 1) Solicitudes y todo lo que cuelga de ellas (en cascada: pedido_items,
--    pedido_emails, notificaciones del pedido, seguimiento_pedidos_tecmelec,
--    enlaces_proveedor_pedido, pedido_compra_pdf_enviado).
delete from public.pedidos;

-- Por si quedara algo suelto sin pedido asociado.
delete from public.pedido_compra_pdf_enviado;
delete from public.enlaces_proveedor_pedido;
delete from public.seguimiento_pedidos_tecmelec;
delete from public.notificaciones;
delete from public.contactos_email_ocultos;

-- 2) Direcciones ocultas (las que solo se conservaban porque las usaba alguna solicitud).
delete from public.direcciones where oculta = true;

-- 3) Numeración: la siguiente solicitud volverá a ser APP-2600001.
delete from public.secuencias_numero_app;

-- 4) Cuentas de prueba. Al borrar la cuenta (auth.users) se borra en cascada
--    su perfil, direcciones, proyectos asignados, favoritos, contactos y filtros.
--    COMPRADOR2, Eduardo BC, EDUARDO comprador, EDUARDO responsable,
--    EDUARDO usuario, USUARIO2
delete from auth.users where id in (
  'd6f74df1-c276-4d6e-b0c6-702053d2b1d4', -- COMPRADOR2           comprador2@tecmelec.es
  '83f8c2ea-db41-45c5-ac53-ab17e4c035a6', -- Eduardo BC           elugo@tecmelecbc.onmicrosoft.com
  '66089a97-479c-4824-b4f4-71294e7c8a4f', -- EDUARDO comprador    proveedores@tecmelec.es (también usuario del CRM)
  '4e0109e2-e97b-42f0-b757-c8fee4b9b170', -- EDUARDO responsable  cmorocho@tecmele.es
  '3fbc2706-aa4b-42c8-a12b-b14581dec66f', -- EDUARDO usuario      compras@tecmelec.es
  'dbe4a7e7-9031-4334-978f-10381cb0b6e0'  -- USUARIO2             usuario2@tecmelec.es
);

-- 5) Comprobación: debe devolver 0 solicitudes y solo los perfiles que se quedan.
select
  (select count(*) from public.pedidos) as solicitudes,
  (select count(*) from public.pedido_items) as lineas,
  (select count(*) from public.notificaciones) as notificaciones,
  (select count(*) from public.direcciones where oculta) as direcciones_ocultas,
  (select string_agg(nombre_completo || ' (' || rol || ')', ', ') from public.profiles) as perfiles_que_quedan;

commit;
