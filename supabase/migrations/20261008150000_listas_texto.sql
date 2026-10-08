-- Carrito desde lista escrita: la lista de materiales se escribe en la app en vez de
-- adjuntar una foto. Se guarda en la misma tabla, sin foto y con el texto original.
alter table public.listas_foto alter column imagen_path drop not null;
alter table public.listas_foto add column if not exists texto text;
