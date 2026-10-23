-- Respuestas a las peticiones de oferta: buzón desde el que se envió cada petición (para
-- leer la conversación y sus adjuntos en Microsoft Graph).
alter table public.peticiones_oferta add column if not exists buzon text;
