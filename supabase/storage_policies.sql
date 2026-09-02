-- Ejecutar DESPUÉS de crear el bucket "productos" (público) desde el panel de Supabase > Storage.

-- Solo el admin puede subir, actualizar o borrar imágenes de productos.
create policy "admin sube imagenes productos"
on storage.objects for insert
with check (bucket_id = 'productos' and public.get_my_role() = 'admin');

create policy "admin actualiza imagenes productos"
on storage.objects for update
using (bucket_id = 'productos' and public.get_my_role() = 'admin');

create policy "admin borra imagenes productos"
on storage.objects for delete
using (bucket_id = 'productos' and public.get_my_role() = 'admin');

-- La lectura pública ya la otorga el bucket al marcarlo "Public bucket" desde el panel.
