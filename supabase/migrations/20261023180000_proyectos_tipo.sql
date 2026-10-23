-- Tipo de proyecto en BC ("Obra" o "Estudio"). Solo los de tipo Obra se pueden elegir
-- para solicitar material. Se rellena al sincronizar proyectos.
alter table public.proyectos add column if not exists tipo text;
