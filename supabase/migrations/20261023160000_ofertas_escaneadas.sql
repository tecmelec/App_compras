-- Respuestas a peticiones de oferta enviadas como email nuevo (fuera del hilo): adjuntos
-- PDF ya revisados en busca del Nº de solicitud, para no volver a descargarlos cada vez.
create table if not exists public.ofertas_escaneadas (
  message_id text not null,
  attachment_id text not null,
  numero_app text not null,
  coincide boolean not null,
  created_at timestamptz not null default now(),
  primary key (message_id, attachment_id, numero_app)
);
alter table public.ofertas_escaneadas enable row level security;
-- Sin políticas: solo se lee y escribe desde el servidor (service role).
