-- ============================================================
-- RESET DE DATOS DE PRUEBA
-- Ejecutar SOLO cuando estés listo para dar acceso real a otros
-- usuarios y quieras borrar todo lo generado durante las pruebas.
--
-- Esto NO toca: usuarios (profiles), productos, proyectos,
-- proveedores, estados de pedido, ni la configuración general.
-- ============================================================

-- Borra todos los pedidos, sus líneas, las direcciones y los favoritos
truncate table public.pedidos, public.pedido_items, public.direcciones, public.favoritos cascade;

-- Reinicia la numeración de "Nº pedido APP" para que el primero
-- vuelva a ser APP-000001
alter sequence public.pedido_numero_seq restart with 1;
