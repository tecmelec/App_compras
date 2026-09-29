# Migraciones de base de datos — Tienda Tecmelec

Hay **dos bases de datos Supabase** separadas:

| Entorno | Proyecto Supabase | Usada por |
|---|---|---|
| Real (producción) | `Portal Compras` (`oappnsquhmgccjnlistx`) | Vercel *Production* (`main`, comprastecmelec.vercel.app) |
| Pruebas | `Portal Compras - Pruebas` | Vercel *Preview* (`prueba-crear-pedido-bc`) |

La base real también contiene tablas de otras aplicaciones (`crm_*`, `almacen_*`) que
**no** forman parte de la Tienda y no se tocan desde aquí.

## Cómo se trabaja
1. Todo cambio de estructura (tablas, columnas, funciones, políticas…) se escribe como un
   archivo nuevo en esta carpeta: `AAAAMMDDhhmmss_descripcion.sql`.
2. Se aplica **primero en la base de pruebas**.
3. Al pasar la rama de prueba a `main`, se aplican en la **base real** todas las migraciones
   que aún no tenga, en orden (se comparan con `list_migrations` de cada proyecto).

`20260929000000_esquema_base_tienda.sql` es la foto completa de la estructura de la Tienda
a 29/09/2026 (la base real ya la tiene; solo se aplica al crear una base nueva).
Los datos (solicitudes, usuarios, catálogo) **nunca** viajan con las migraciones.
