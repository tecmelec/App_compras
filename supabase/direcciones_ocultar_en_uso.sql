-- Antes, si una dirección ya estaba usada en algún pedido, no se podía
-- borrar (el pedido la referencia y se perdería el histórico). Con esta
-- columna, en vez de fallar, esas direcciones se "ocultan" del listado
-- del usuario (para futuras solicitudes) pero se mantienen intactas
-- para que los pedidos antiguos sigan mostrando la dirección correcta.

alter table public.direcciones
  add column if not exists oculta boolean not null default false;
