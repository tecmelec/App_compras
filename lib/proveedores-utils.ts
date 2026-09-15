// Supabase/PostgREST limita cada consulta a 1000 filas por defecto. Si hay más
// proveedores que eso (muy posible viniendo de un maestro de BC grande), un
// .select() normal se queda corto en silencio — sin error, simplemente trunca.
// Esta función pagina con .range() hasta traerlos todos.
export async function obtenerTodosLosProveedores(
  supabase: any,
  columnas: string = 'id, bc_proveedor_no, nombre',
  ordenarPor: string = 'nombre'
) {
  const PAGE = 1000;
  let desde = 0;
  let todos: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('proveedores')
      .select(columnas)
      .order(ordenarPor)
      .range(desde, desde + PAGE - 1);

    if (error) return { data: todos, error };
    if (!data || data.length === 0) break;

    todos = todos.concat(data);
    if (data.length < PAGE) break;
    desde += PAGE;
  }

  return { data: todos, error: null };
}
