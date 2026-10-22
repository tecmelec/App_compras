-- Comprador IA — Fase 1, paso 2: notas de la IA sobre la propuesta de compra.
-- Interruptor para apagarlas al momento (Administración → Configuración) y resultado
-- guardado con cada propuesta.
alter table public.configuracion add column if not exists propuesta_ia_activa boolean not null default true;
alter table public.propuestas_compra add column if not exists ia jsonb;
