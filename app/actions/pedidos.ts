'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { enviarEmailSolicitud } from '@/lib/email';
import { recalcularEstadoGeneral } from '@/lib/pedidos-utils';
import { sincronizarFechasConBC } from '@/app/actions/proveedor-fecha-entrega';
import { despacharPushPendientes } from '@/lib/push';
import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerJefeObraProyectoBC } from '@/lib/business-central';
import { lineasListaFotoSinResolver } from '@/lib/lista-foto';

type ItemInput = { producto_id: string; nombre: string; cantidad: number };

type DatosSolicitud = {
  proyecto_id: string;
  nombre_contacto: string;
  telefono_contacto: string;
  direccion_entrega_id: string;
  fecha_requerida: string;
  comprador_id?: string | null;
  seguir_pedido?: boolean;
  lista_foto_ids?: string[];
};

export async function crearPedido(items: ItemInput[], datos: DatosSolicitud) {
  // Se permite enviar sin artículos si va una lista de materiales (foto o escrita):
  // el responsable asignará los artículos o rechazará las líneas al aprobarla.
  if (items.length === 0 && !(datos.lista_foto_ids && datos.lista_foto_ids.length > 0)) {
    return { error: 'El carrito está vacío.' };
  }

  if (!datos.proyecto_id) {
    return { error: 'Selecciona el proyecto.' };
  }

  if (!datos.nombre_contacto || !datos.telefono_contacto) {
    return { error: 'Falta el nombre o el teléfono de contacto.' };
  }

  if (!datos.direccion_entrega_id) {
    return { error: 'Selecciona una dirección de entrega.' };
  }

  if (!datos.fecha_requerida) {
    return { error: 'Selecciona la fecha requerida de entrega.' };
  }

  const fecha = new Date(datos.fecha_requerida + 'T00:00:00');
  const diaSemana = fecha.getDay(); // 0 = domingo, 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) {
    return { error: 'La fecha requerida no puede ser sábado ni domingo.' };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha <= hoy) {
    return { error: 'La fecha requerida debe ser posterior a hoy.' };
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Debes iniciar sesión.' };
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('nombre_completo, rol, comprador_id, responsable_id')
    .eq('id', user.id)
    .single();

  if (!perfil) {
    return { error: 'No se encontró tu perfil de usuario.' };
  }

  // El usuario normal siempre usa su comprador/responsable asignado.
  // Admin y responsable eligen el comprador manualmente al solicitar (no tienen uno fijo).
  // Un comprador que pide para sí mismo se autoasigna como comprador de su propio pedido,
  // pero sigue necesitando la aprobación de su responsable si supera el límite (como un usuario más).
  const puedeElegirComprador = perfil.rol === 'admin' || perfil.rol === 'responsable';
  const compradorFinal = puedeElegirComprador
    ? datos.comprador_id || null
    : perfil.rol === 'comprador'
      ? user.id
      : perfil.comprador_id;

  if (puedeElegirComprador && !compradorFinal) {
    return { error: 'Selecciona un comprador para esta solicitud.' };
  }

  // "Predet." es una dirección virtual tomada de la ficha del proyecto en Business Central.
  // Como direccion_entrega_id es una referencia obligatoria a "direcciones", cada pedido que
  // usa "Predet." crea su PROPIA fila con un snapshot de esa dirección en ese momento —oculta,
  // para que no aparezca en el listado de direcciones guardadas del usuario (ya se muestra ahí
  // como la tarjeta "Predet." virtual, calculada en el modal a partir del proyecto). Antes se
  // reutilizaba/actualizaba una única fila por usuario, lo que además de aparecer duplicada en
  // el listado, hacía que pedidos antiguos de otros proyectos pudieran acabar mostrando la
  // dirección de un proyecto distinto si esa fila compartida se sobrescribía más tarde.
  let direccionEntregaId = datos.direccion_entrega_id;
  if (direccionEntregaId === '__predet__') {
    const { data: proyecto } = await supabase
      .from('proyectos')
      .select('direccion, codigo_postal, ciudad, provincia')
      .eq('id', datos.proyecto_id)
      .single();

    if (!proyecto?.direccion) {
      return { error: 'El proyecto seleccionado no tiene una dirección predeterminada en Business Central.' };
    }

    const { data: nuevaDireccion, error: errorDireccion } = await supabase
      .from('direcciones')
      .insert({
        usuario_id: user.id,
        alias: 'Predet.',
        direccion: proyecto.direccion,
        codigo_postal: proyecto.codigo_postal,
        ciudad: proyecto.ciudad,
        provincia: proyecto.provincia,
        oculta: true,
      })
      .select('id')
      .single();

    if (errorDireccion || !nuevaDireccion) {
      return { error: 'No se pudo guardar la dirección predeterminada.' };
    }
    direccionEntregaId = nuevaDireccion.id;
  }

  // Si el comprador o el responsable asignado tiene un sustituto activo (ej: vacaciones),
  // el pedido se asigna directamente a ese sustituto: así lo ve en sus listados y le llega el email.
  // Se resuelve con una función segura (RPC) para que funcione sin importar el rol de quien solicita.
  async function resolverSustituto(id: string | null): Promise<string | null> {
    if (!id) return id;
    const { data } = await supabase.rpc('resolver_sustituto', { id });
    return data || id;
  }

  const compradorEfectivo = await resolverSustituto(compradorFinal);

  // Aprobador de la solicitud: el jefe de obra (Project Manager) del proyecto en BC,
  // identificado por su Id. de seguridad de usuario (= profiles.bc_user_id), siempre que
  // esté dado de alta en la app, activo y con rol responsable o admin (los únicos que
  // tienen la bandeja "Solicitudes de mi equipo"). Si no, se usa el responsable asignado
  // al solicitante, como hasta ahora. Si BC no responde, no se bloquea la solicitud:
  // se registra el error y se usa también el responsable asignado.
  let jefeObraId: string | null = null;
  try {
    const { data: proyectoSolicitud } = await supabase
      .from('proyectos')
      .select('bc_job_no')
      .eq('id', datos.proyecto_id)
      .single();
    if (proyectoSolicitud?.bc_job_no) {
      const jefe = await obtenerJefeObraProyectoBC(proyectoSolicitud.bc_job_no);
      if (jefe.userSecurityId) {
        const { data: perfilesJefe } = await createAdminClient()
          .from('profiles')
          .select('id')
          .eq('bc_user_id', jefe.userSecurityId)
          .eq('activo', true)
          .in('rol', ['responsable', 'admin'])
          .limit(1);
        jefeObraId = perfilesJefe?.[0]?.id || null;
      }
    }
  } catch (e) {
    console.error('[crearPedido] No se pudo obtener el jefe de obra del proyecto en BC; se usa el responsable asignado.', e);
  }

  // 1. Calcular el total real a partir de los precios guardados en la base (nunca confiar en el precio del cliente)
  const idsProductos = items.map((i) => i.producto_id);
  const { data: productosDb } = await supabase
    .from('productos')
    .select('id, precio, nombre, multiplo_compra')
    .in('id', idsProductos);

  // No confiar tampoco en la cantidad del cliente: si el producto tiene un
  // múltiplo de compra, se vuelve a comprobar aquí (la validación de la
  // tienda es solo para guiar al usuario, no una garantía).
  const multiplos = new Map((productosDb || []).map((p) => [p.id, { multiplo: p.multiplo_compra || 1, nombre: p.nombre }]));
  for (const item of items) {
    const info = multiplos.get(item.producto_id);
    const multiplo = info?.multiplo || 1;
    if (multiplo > 1 && item.cantidad % multiplo !== 0) {
      return {
        error: `La cantidad de "${info?.nombre || item.nombre}" debe ser múltiplo de ${multiplo} (has pedido ${item.cantidad}).`,
      };
    }
  }

  const precios = new Map((productosDb || []).map((p) => [p.id, p.precio]));
  const totalEstimado = items.reduce(
    (suma, item) => suma + (precios.get(item.producto_id) || 0) * item.cantidad,
    0
  );

  // 2. Determinar si supera el límite de aprobación automática
  const { data: config } = await supabase
    .from('configuracion')
    .select('limite_aprobacion')
    .eq('id', 1)
    .single();

  const limite = config?.limite_aprobacion ?? 200;

  // - El solicitante es el propio jefe de obra: no necesita aprobación.
  // - Hay jefe de obra en la app: lo aprueba él (o su sustituto) si se supera el límite,
  //   sea cual sea el perfil del solicitante (también admin y responsable).
  // - No hay jefe de obra en la app: como antes, el responsable asignado al solicitante;
  //   admin y responsable no tienen responsable asignado y no necesitan aprobación.
  let responsableBase: string | null;
  let requiereAprobacion: boolean;
  if (jefeObraId && jefeObraId === user.id) {
    responsableBase = user.id;
    requiereAprobacion = false;
  } else if (jefeObraId) {
    responsableBase = jefeObraId;
    requiereAprobacion = totalEstimado > limite;
  } else {
    responsableBase = perfil.responsable_id;
    requiereAprobacion = puedeElegirComprador ? false : totalEstimado > limite;
  }
  // Solicitud creada desde una lista en foto: siempre la aprueba el responsable,
  // sea cual sea el importe (también el propio jefe de obra si la pide él), porque
  // antes hay que asignar o rechazar las líneas que no estaban en la tienda.
  // Solo si no hay nadie que pueda aprobarla (admin/responsable sin jefe de obra en la app) no se exige.
  const desdeFoto = (datos.lista_foto_ids || []).length > 0;
  if (desdeFoto && responsableBase) requiereAprobacion = true;
  const responsableEfectivo =
    responsableBase === user.id ? user.id : await resolverSustituto(responsableBase);

  // 3. Crear el pedido
  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      usuario_id: user.id,
      proyecto_id: datos.proyecto_id,
      comprador_id: compradorEfectivo,
      responsable_id: responsableEfectivo,
      nombre_contacto: datos.nombre_contacto,
      telefono_contacto: datos.telefono_contacto,
      direccion_entrega_id: direccionEntregaId,
      fecha_requerida: datos.fecha_requerida,
      total_estimado: totalEstimado,
      requiere_aprobacion: requiereAprobacion,
      aprobado: requiereAprobacion ? null : true,
      seguir_pedido: datos.seguir_pedido ?? false,
    })
    .select('id, numero_app')
    .single();

  if (errorPedido || !pedido) {
    return { error: 'No se pudo crear el pedido. Intenta nuevamente.' };
  }

  // 4. Crear las líneas del pedido
  const { error: errorItems } =
    items.length > 0
      ? await supabase.from('pedido_items').insert(
          items.map((i) => ({
            pedido_id: pedido.id,
            producto_id: i.producto_id,
            cantidad: i.cantidad,
          }))
        )
      : { error: null };

  if (errorItems) {
    return { error: 'El pedido se creó pero hubo un problema guardando los artículos.' };
  }

  // Carrito desde foto: vincula la(s) lista(s) en foto a la solicitud para su informe.
  if (datos.lista_foto_ids && datos.lista_foto_ids.length > 0) {
    const { error: errorListas } = await createAdminClient()
      .from('listas_foto')
      .update({ pedido_id: pedido.id })
      .in('id', datos.lista_foto_ids)
      .eq('usuario_id', user.id)
      .is('pedido_id', null);
    if (errorListas) console.error('[crearPedido] No se pudo vincular la lista en foto:', errorListas);
  }

  // 5. Obtener emails del comprador y responsable efectivos (ya considerando sustituto)
  const idsDestino = [compradorEfectivo, responsableEfectivo].filter(Boolean) as string[];
  let destinatarios: string[] = [];

  if (idsDestino.length > 0) {
    const { data: contactos } = await supabase
      .from('profiles')
      .select('email')
      .in('id', idsDestino);
    destinatarios = (contactos || []).map((c) => c.email);
  }

  // 6. Enviar email (si falla, no revertimos el pedido; solo lo reportamos)
  try {
    await enviarEmailSolicitud({
      destinatarios,
      solicitante: perfil.nombre_completo,
      numeroApp: pedido.numero_app,
      items: items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad })),
      requiereAprobacion,
    });
  } catch (e) {
    console.error('Error enviando email de solicitud:', e);
  }

  await despacharPushPendientes();
  return { success: true, numeroApp: pedido.numero_app };
}

export async function actualizarPedido(
  pedidoId: string,
  datos: { estado_general?: string; fecha_estimada_entrega: string | null; total_estimado?: number }
) {
  const supabase = createClient();

  const cambios: Record<string, any> = {
    fecha_estimada_entrega: datos.fecha_estimada_entrega || null,
    updated_at: new Date().toISOString(),
  };
  if (datos.estado_general !== undefined) cambios.estado_general = datos.estado_general;
  if (datos.total_estimado !== undefined) cambios.total_estimado = datos.total_estimado;

  const { error } = await supabase.from('pedidos').update(cambios).eq('id', pedidoId);

  if (error) {
    return { error: 'No se pudo actualizar el pedido.' };
  }

  await despacharPushPendientes();
  return { success: true };
}

// El comprador puede cambiar la cantidad de una línea SOLO antes de crear el
// pedido en BC (sin Nº pedido Tecmelec): la sincronización con BC identifica
// cada línea por artículo + cantidad exacta, así que cambiarla después rompería
// el cruce. Además la solicitud tiene que estar aprobada (o no requerir
// aprobación), la línea no puede estar rechazada y se respeta el múltiplo de compra.
// Se guarda el historial para el aviso "!": cantidad_original (lo que pidió el
// usuario) y cantidad_modificada_por_comprador.
async function aplicarCambiosCantidadComprador(
  supabase: ReturnType<typeof createClient>,
  pedidoId: string,
  items: { id: string; cantidad?: number }[]
): Promise<string | null> {
  const conCantidad = items.filter((i) => i.cantidad !== undefined);
  if (conCantidad.length === 0) return null;

  const [{ data: pedido }, { data: actuales }] = await Promise.all([
    supabase.from('pedidos').select('requiere_aprobacion, aprobado').eq('id', pedidoId).single(),
    supabase
      .from('pedido_items')
      .select(
        'id, cantidad, cantidad_original, cantidad_aprobador, numero_tecmelec, rechazada_por_aprobador, productos(nombre, multiplo_compra)'
      )
      .eq('pedido_id', pedidoId)
      .in(
        'id',
        conCantidad.map((i) => i.id)
      ),
  ]);
  const actualPorId = new Map((actuales || []).map((a: any) => [a.id, a]));

  for (const item of conCantidad) {
    const actual: any = actualPorId.get(item.id);
    if (!actual) return 'Línea no encontrada.';
    const nueva = Number(item.cantidad);
    if (nueva === actual.cantidad) continue;

    const nombre = actual.productos?.nombre || 'artículo';
    if (!pedido || pedido.aprobado === false || (pedido.requiere_aprobacion && pedido.aprobado !== true)) {
      return `No se puede cambiar la cantidad de "${nombre}": la solicitud aún no está aprobada.`;
    }
    if (actual.numero_tecmelec) {
      return `No se puede cambiar la cantidad de "${nombre}": ya tiene pedido en Business Central (${actual.numero_tecmelec}).`;
    }
    if (actual.rechazada_por_aprobador) {
      return `No se puede cambiar la cantidad de "${nombre}": la línea fue rechazada por el aprobador.`;
    }
    const multiplo = Math.max(actual.productos?.multiplo_compra || 1, 1);
    if (!Number.isInteger(nueva) || nueva <= 0) return `Cantidad no válida para "${nombre}".`;
    if (nueva % multiplo !== 0) return `La cantidad de "${nombre}" debe ser múltiplo de ${multiplo}.`;

    const original = actual.cantidad_original ?? actual.cantidad;
    const base = actual.cantidad_aprobador ?? original; // lo que había antes de que tocara Compras
    const porComprador = nueva !== base;
    const { error } = await supabase
      .from('pedido_items')
      .update({
        cantidad: nueva,
        // Si vuelve a quedar exactamente como la pidió el usuario y nadie más la cambió, no hay nada que avisar.
        cantidad_original: !porComprador && actual.cantidad_aprobador == null ? null : original,
        cantidad_modificada_por_comprador: porComprador,
      })
      .eq('id', item.id);
    if (error) return `No se pudo guardar la cantidad de "${nombre}".`;
  }

  return null;
}

export async function actualizarLineasTecmelec(
  pedidoId: string,
  items: {
    id: string;
    numero_tecmelec: string;
    fecha_estimada_entrega: string | null;
    estado_id: number;
    estado_recepcion: string;
    proveedor_id: string | null;
    precio_unitario: number;
    cantidad?: number;
  }[]
) {
  const supabase = createClient();

  // Cambios de cantidad hechos por el comprador (ver aplicarCambiosCantidadComprador).
  const errorCantidades = await aplicarCambiosCantidadComprador(supabase, pedidoId, items);
  if (errorCantidades) return { error: errorCantidades };

  // Para saber si la fecha de entrega cambia de verdad: si el comprador la
  // toca a mano, la confirmación que hubiera dejado el proveedor (por el
  // enlace público) deja de corresponder a lo que se ve en pantalla y hay
  // que limpiarla; si no la toca, se deja tal cual está.
  const { data: actuales } = await supabase
    .from('pedido_items')
    .select('id, fecha_estimada_entrega')
    .in(
      'id',
      items.map((i) => i.id)
    );
  const fechaActualPorId = new Map((actuales || []).map((a) => [a.id, a.fecha_estimada_entrega]));

  for (const item of items) {
    const fechaNueva = item.fecha_estimada_entrega || null;
    const fechaCambio = (fechaActualPorId.get(item.id) ?? null) !== fechaNueva;

    const { error } = await supabase
      .from('pedido_items')
      .update({
        numero_tecmelec: item.numero_tecmelec || null,
        fecha_estimada_entrega: fechaNueva,
        ...(fechaCambio ? { fecha_estimada_entrega_confirmada_en: null } : {}),
        estado_id: item.estado_id,
        estado_recepcion: item.estado_recepcion,
        proveedor_id: item.proveedor_id,
        precio_unitario: item.precio_unitario,
      })
      .eq('id', item.id);

    if (error) {
      return { error: 'No se pudo guardar los datos de una de las líneas.' };
    }
  }

  // El "Estado" general se recalcula solo a partir del estado de cada línea
  // (ver recalcularEstadoGeneral) — no se toca aquí si el pedido está Anulado.
  await recalcularEstadoGeneral(supabase, pedidoId);

  // Si el comprador cambia a mano la fecha de una línea que ya tiene Nº
  // pedido Tecmelec, se intenta reflejar también en BC (mismo mecanismo que
  // cuando la confirma el proveedor). Es best-effort: no debe impedir que se
  // guarde el cambio en la app si BC falla.
  const cambiosPorGrupo = new Map<string, { itemId: string; fecha: string }[]>();
  for (const item of items) {
    const fechaNueva = item.fecha_estimada_entrega || null;
    const fechaCambio = (fechaActualPorId.get(item.id) ?? null) !== fechaNueva;
    if (!fechaCambio || !fechaNueva || !item.numero_tecmelec) continue;

    if (!cambiosPorGrupo.has(item.numero_tecmelec)) cambiosPorGrupo.set(item.numero_tecmelec, []);
    cambiosPorGrupo.get(item.numero_tecmelec)!.push({ itemId: item.id, fecha: fechaNueva });
  }

  for (const [numeroTecmelec, cambios] of cambiosPorGrupo) {
    try {
      await sincronizarFechasConBC(supabase, numeroTecmelec, cambios);
    } catch (e: any) {
      console.error(`[actualizarLineasTecmelec ${numeroTecmelec}] No se pudo sincronizar con BC:`, e.message || e);
    }
  }

  await despacharPushPendientes();
  return { success: true };
}

// Aprobación con cambios por línea: el responsable puede modificar cantidades
// o rechazar líneas sueltas. Todo se aplica de una vez en la base de datos
// (función aprobar_solicitud_con_cambios), que también comprueba permisos,
// múltiplos de compra y recalcula el total. Si rechaza todas las líneas, la
// solicitud queda rechazada.
export async function aprobarSolicitudConCambios(
  pedidoId: string,
  lineas: { id: string; cantidad?: number; rechazada?: boolean }[]
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };

  // Lista en foto: no se puede aprobar con líneas sin artículo ni rechazar (sí se puede
  // rechazar la solicitud entera).
  const rechazaTodo = lineas.length > 0 && lineas.every((l) => l.rechazada);
  {
    const { data: activos } = await supabase
      .from('pedido_items')
      .select('id')
      .eq('pedido_id', pedidoId)
      .eq('rechazada_por_aprobador', false)
      .limit(1);
    if (!activos || activos.length === 0) {
      return { error: 'La solicitud no tiene ningún artículo para aprobar: asigna artículos o recházala.' };
    }
  }
  if (!rechazaTodo) {
    const sinResolver = await lineasListaFotoSinResolver(pedidoId);
    if (sinResolver.length > 0) {
      return {
        error: `Antes de aprobar, asigna un artículo o rechaza las líneas pendientes de la lista de materiales: ${sinResolver.join(', ')}.`,
      };
    }
  }

  const { data, error } = await supabase.rpc('aprobar_solicitud_con_cambios', {
    p_pedido_id: pedidoId,
    p_lineas: lineas,
  });

  if (error) return { error: error.message || 'No se pudo registrar la decisión.' };

  await recalcularEstadoGeneral(supabase, pedidoId);
  revalidatePath(`/responsable/${pedidoId}`);
  revalidatePath(`/mis-pedidos/${pedidoId}`);
  revalidatePath(`/comprador/${pedidoId}`);

  await despacharPushPendientes();
  return { success: true, resultado: data as 'aprobada' | 'rechazada' };
}

export async function responderAprobacion(pedidoId: string, aprobado: boolean) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  if (aprobado) {
    const { data: activos } = await supabase
      .from('pedido_items')
      .select('id')
      .eq('pedido_id', pedidoId)
      .eq('rechazada_por_aprobador', false)
      .limit(1);
    if (!activos || activos.length === 0) {
      return { error: 'La solicitud no tiene ningún artículo para aprobar: asigna artículos o recházala.' };
    }
    const sinResolver = await lineasListaFotoSinResolver(pedidoId);
    if (sinResolver.length > 0) {
      return {
        error: `Antes de aprobar, asigna un artículo o rechaza las líneas pendientes de la lista de materiales: ${sinResolver.join(', ')}.`,
      };
    }
  }

  const { error } = await supabase
    .from('pedidos')
    .update({
      aprobado,
      aprobado_por: user.id,
      aprobado_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId);

  if (error) return { error: 'No se pudo registrar la decisión.' };

  await despacharPushPendientes();
  return { success: true };
}
