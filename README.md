# Tienda Tecmelec — Plataforma de solicitud de materiales

## Qué incluye esta primera versión
- Login con usuario/contraseña asignados por el administrador (sin autorregistro).
- **Tienda Tecmelec**: catálogo de productos con imagen y descripción.
- **Carrito**: selección de artículos y cantidades, con botón "Solicitar materiales".
- Al solicitar: se crea el pedido, se guardan los artículos y se envía un email (vía Resend) al comprador y responsable asignados a ese usuario.
- **Mis pedidos**: listado con Nº pedido APP, Nº pedido Tecmelec, estado, y detalle completo al hacer clic.
- **Panel comprador**: ve las solicitudes de sus usuarios asignados y puede asignar el Nº pedido Tecmelec, el estado y la fecha estimada de entrega.
- **Panel responsable**: ve las solicitudes de sus usuarios asignados, en modo solo lectura.
- **Panel de administración** (solo rol `admin`, en `/admin`):
  - **Usuarios**: crear cuentas (usuario + contraseña), asignar rol, comprador y responsable, y resetear contraseñas.
  - **Productos**: crear/editar/eliminar productos, subir imágenes directamente al Storage de Supabase, y ocultar productos de la tienda sin borrarlos.
  - **Estados de pedido**: añadir o quitar los estados disponibles, sin tocar código.

## 1. Configurar Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/schema.sql` (crea las tablas, relaciones y seguridad por rol).
3. Ve a **Authentication > Users** y crea manualmente el primer usuario (tú, como admin).
4. Ve a **Table Editor > profiles** y crea la fila correspondiente a ese usuario con `rol = 'admin'` (el `id` debe coincidir con el `id` del usuario creado en Authentication).
5. Repite esto para cada persona que necesite acceso: primero se crea en Authentication (con la contraseña que tú definas), luego se crea su fila en `profiles` indicando su `rol` (`usuario`, `comprador` o `responsable`) y, si es `usuario`, sus `comprador_id` y `responsable_id`.
6. Ve a **Storage** y crea un bucket **público** llamado `productos` para subir las imágenes del catálogo.
7. Ejecuta también `supabase/storage_policies.sql` en el SQL Editor (permite que solo el admin suba/edite/borre imágenes).
8. Ve a **Project Settings > API** y copia la **service_role key** (la usarás en el paso 3). Guárdala con cuidado: da acceso total a la base de datos y nunca debe exponerse en el navegador.
9. Ya no necesitas crear usuarios ni productos manualmente desde el panel de Supabase — con tu primer usuario admin creado (pasos 3-4), el resto se gestiona desde `/admin` dentro de la propia app.

## 2. Configurar Resend (envío de emails)
1. Crea una cuenta en [resend.com](https://resend.com) y verifica tu dominio de email.
2. Genera una API key.
3. Tenla lista para el paso 4.

## 3. Variables de entorno
Copia `.env.local.example` a `.env.local` y completa los valores de Supabase y Resend.

## 4. Instalar y correr en local
```bash
npm install
npm run dev
```

## 5. Desplegar en Vercel
1. Sube este proyecto a un repositorio de GitHub.
2. Impórtalo en [vercel.com](https://vercel.com).
3. Añade las mismas variables de entorno del paso 3 en la configuración del proyecto en Vercel.
4. Despliega.

## Pendiente / próximos pasos
- Definir la lista definitiva de estados de pedido (hoy solo existe "Pendiente" — se añaden con un simple `INSERT` en `estados_pedido`, sin tocar código).
- Panel de administración dentro de la app para gestionar usuarios, productos y asignaciones (por ahora se hace desde el panel de Supabase).
- Integración con Business Central para sincronizar Nº pedido Tecmelec, fecha de entrega y estado automáticamente.
