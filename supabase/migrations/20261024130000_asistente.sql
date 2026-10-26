-- Asistente de la app (fase 1): interruptor y registro de preguntas/respuestas con
-- valoración (👍/👎) para mejorar la guía.
alter table public.configuracion add column if not exists asistente_activo boolean not null default true;

create table if not exists public.asistente_mensajes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id) on delete set null,
  rol text,
  ruta text,
  pregunta text not null,
  respuesta text not null,
  valoracion smallint, -- 1 = útil, -1 = no útil
  created_at timestamptz not null default now()
);
create index if not exists asistente_mensajes_created_at_idx on public.asistente_mensajes (created_at desc);
alter table public.asistente_mensajes enable row level security;
-- Sin políticas: solo se lee y escribe desde el servidor (service role).
