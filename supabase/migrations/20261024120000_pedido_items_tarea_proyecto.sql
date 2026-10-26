-- Tarea de proyecto (Nº tarea proyecto de BC, tipo Registro) elegida para cada línea al
-- crear la solicitud ("Asignar líneas de planificación manualmente"). Vacía = la tarea
-- por defecto 95.01 al crear el pedido de compra en BC.
alter table public.pedido_items add column if not exists job_task_no text;
