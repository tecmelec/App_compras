-- Carrito por referencias: una lista puede llevar varias fotos y/o texto.
--  - imagenes: todas las fotos (imagen_path sigue siendo la primera, por compatibilidad).
--  - modo: 'materiales' (foto o lista de obra) o 'referencias' (referencias de fabricante).
alter table public.listas_foto add column if not exists imagenes text[];
alter table public.listas_foto add column if not exists modo text not null default 'materiales';
