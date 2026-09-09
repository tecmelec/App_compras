-- Dirección de la ficha de proyecto en Business Central, para ofrecerla
-- como dirección predeterminada ("Predet.") al solicitar materiales.
alter table public.proyectos add column direccion text;
alter table public.proyectos add column codigo_postal text;
alter table public.proyectos add column ciudad text;
alter table public.proyectos add column provincia text;
