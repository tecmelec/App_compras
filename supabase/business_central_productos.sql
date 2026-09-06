-- Vincula cada producto con su ficha en Business Central y guarda su unidad de medida
alter table public.productos add column bc_item_no text unique;
alter table public.productos add column unidad_medida text;
