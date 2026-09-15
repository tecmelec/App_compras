-- Proveedor predeterminado del producto, tomado de Vendor_No en el feed de
-- artículos de Business Central (o editable a mano desde /admin/productos).
alter table public.productos
  add column if not exists proveedor_predeterminado_id uuid references public.proveedores(id);
