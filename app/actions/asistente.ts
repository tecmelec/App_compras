'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GUIA_APP, RUTAS_PERMITIDAS } from '@/lib/asistente/guia';
import { visitasParaRol } from '@/lib/asistente/visitas';
import { herramientasParaRol, ROLES_CATALOGO_BC, ejecutarHerramienta, type AccionAsistente } from '@/lib/asistente/herramientas';
import { sanearAdjunto, textoAdjunto, type AdjuntoAsistente } from '@/lib/asistente/adjuntos';

// Asistente de la app (fase 1): responde dudas de uso con la guía, según el perfil y la
// pantalla, y propone botones para ir a cada sitio ([[Texto|/ruta]]).

const MODELO = process.env.ANTHROPIC_MODEL_ASISTENTE || 'claude-haiku-5-5';
const ROLES: Record<string, string> = { usuario: 'Usuario', responsable: 'Responsable', comprador: 'Comprador', admin: 'Admin', integral: 'Integral' };

export type MensajeAsistente = { rol: 'user' | 'assistant'; texto: string; adjunto?: AdjuntoAsistente | null };

export async function preguntarAsistente(mensajes: MensajeAsistente[], ruta: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const { data: perfil } = await supabase.from('profiles').select('rol, nombre_completo, activo').eq('id', user.id).single();
  if (!perfil?.activo) return { error: 'No autorizado.' };

  const admin = createAdminClient();
  const { data: config } = await admin.from('configuracion').select('*').eq('id', 1).maybeSingle();
  if ((config as any)?.asistente_activo === false) return { error: 'El asistente está desactivado. Contacta con compras si necesitas ayuda.' };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'El asistente no está configurado (falta ANTHROPIC_API_KEY).' };

  const historial = mensajes
    .filter((m) => m.texto.trim() || m.adjunto)
    .slice(-12)
    .map((m) => ({ rol: m.rol, texto: m.texto || '', adjunto: m.rol === 'user' ? sanearAdjunto(m.adjunto) : null }));
  const ultima = historial[historial.length - 1];
  if (!ultima || ultima.rol !== 'user') return { error: 'Escribe tu pregunta.' };
  if (ultima.texto.length > 1500) return { error: 'La pregunta es demasiado larga.' };

  const rutas = RUTAS_PERMITIDAS.filter((r) => r.roles.includes(perfil.rol)).map((r) => r.ruta);
  const visitas = visitasParaRol(perfil.rol);
  const destinos = [...rutas, ...visitas.map((v) => `tour:${v.id}`)];
  const herramientas = herramientasParaRol(perfil.rol);
  const catalogoBC = ROLES_CATALOGO_BC.includes(perfil.rol);
  const system = `Eres el asistente de ayuda de la app de compras de Tecmelec (empresa de instalaciones eléctricas en España). Ayudas a las personas a usar la app, paso a paso y en español sencillo, tuteando.

Quién pregunta: ${perfil.nombre_completo || 'un usuario'}, perfil ${ROLES[perfil.rol] || perfil.rol}.
Pantalla en la que está ahora: ${ruta || 'desconocida'}.

Reglas:
- Responde SOLO con lo que dice la guía de abajo. Si algo no está en la guía, di que no lo sabes y sugiere contactar con compras (recuadro "¿Necesitas ayuda?" del menú). No inventes botones, pantallas ni funciones.
- Ten en cuenta el perfil: no expliques funciones que su perfil no puede usar (si pregunta por ellas, dile que su perfil no tiene acceso).
- Sé breve: pasos numerados cortos, de uno en uno si es un proceso largo, y pregunta si quiere seguir.
- Cuando indiques ir a una pantalla, añade un botón con la sintaxis [[Texto del botón|/ruta]] en su propia línea. Solo puedes usar estas rutas: ${rutas.join(', ')}.
- Usa los nombres exactos de los botones y pantallas entre comillas, como aparecen en la app.
- Visitas guiadas: la app puede enseñar un proceso resaltando en pantalla cada botón, paso a paso. Cuando expliques uno de estos procesos, ofrécela al final con un botón [[▶ Ver visita guiada|tour:ID]] (solo estas): ${visitas.map((v) => `tour:${v.id} = "${v.titulo}"`).join('; ')}.
- Herramientas: puedes buscar artículos en la tienda (buscar_articulos), proponer añadirlos al carrito (proponer_carrito: se muestra una tarjeta y es el usuario quien confirma; nunca digas que ya están en el carrito), ver sus últimas solicitudes (mis_solicitudes), buscar en las líneas de compra que puede ver por artículo y/o proyecto (buscar_lineas_compra, p. ej. "¿se ha pedido arena para Robledo?" o "¿cuánto se ha gastado en cinta aislante en la obra X?"; si el perfil ve precios devuelve precios, importes y totales), consultar las últimas compras de un artículo en BC con su precio (ultimas_compras_bc) y el detalle de una solicitud (detalle_solicitud: artículos, pedido, fecha estimada y recepción). Úsalas cuando ayuden.${
    catalogoBC
      ? `
- Si buscar_articulos no encuentra el artículo en la tienda, búscalo tú mismo en el catálogo completo de BC con buscar_articulos_bc (prueba también variantes: p. ej. "5G10", "5x10", el tipo de cable o la marca). Si aparece, enséñale las opciones (código y descripción), confirma el artículo exacto y la cantidad y propónlo con proponer_carrito usando codigo_bc; avísale de que esa solicitud pasará por el aprobador. Ofrece además el botón [[Crear desde artículos de BC|/carrito/articulos-bc]] por si prefiere buscarlo él. Solo si tampoco está en BC, sugiere "Crear carrito desde lista/REF./foto" o "Solicitar alta de artículos".`
      : ' Si buscar_articulos no encuentra nada, sugiere "Crear carrito desde foto/lista/REF.".'
  }
- Adjuntos: el usuario puede adjuntar fotos o un PDF; la app los analiza y te pasa el resultado en un bloque "[Adjunto: …]" al final de su mensaje (tú no ves la imagen).
  · Lista de materiales: las líneas de "Ya mostradas en la tarjeta de carrito" ya se le han propuesto en una tarjeta debajo de tu respuesta: díselo en una frase (puede revisar cantidades y desmarcar lo que no quiera) y no las repitas una a una. Para cada línea "Sin resolver", enséñale de forma breve sus candidatos (nombre y código) y pregúntale cuál quiere; cuando elija, propónlo con proponer_carrito (producto_id del candidato). Si no tiene candidatos, búscalo con buscar_articulos${catalogoBC ? ' y, si no aparece, con buscar_articulos_bc' : ''}. Si la lista es larga o hay muchas líneas sin resolver, ofrécele también [[Crear carrito desde foto|/carrito/foto]].
  · Foto de un material: busca cada material identificado con buscar_articulos usando las búsquedas sugeridas (y la referencia)${catalogoBC ? ', y si no aparece con buscar_articulos_bc' : ''}; enséñale las opciones, pregunta la cantidad si no la ha dicho y propón el carrito.
  · Si no se ha reconocido nada, díselo y pídele una foto más cercana y nítida, o que escriba lo que necesita.
- Para pedir material: busca, confirma con el usuario el artículo exacto si hay dudas (varios parecidos) y la cantidad, y entonces propón el carrito. Recuérdale que después debe enviar la solicitud desde el carrito ("Solicitar materiales").
- Al dar el estado de una solicitud, resume por artículo: pedido de compra, fecha estimada (y si está confirmada) y recepción. Puedes añadir un botón al detalle con [[Ver en Líns. compras|ENLACE]] usando el enlace que devuelve la herramienta.
- Precios e importes: solo puedes darlos si las herramientas los devuelven. El perfil usuario NO puede ver precios ni importes: si los pide, dile que su perfil no tiene acceso a esa información. Los importes son sin IVA; indica si hay líneas sin precio (0 €) que no suman.
- No pidas ni muestres contraseñas ni datos de otras personas. No modificas nada en la app: solo consultas, explicas y propones.

GUÍA DE LA APP:
${GUIA_APP}`;

  let texto = '';
  const acciones: AccionAsistente[] = [];

  // Adjunto de la pregunta actual con una lista de materiales: las líneas que el análisis
  // ha resuelto se proponen directamente en la tarjeta del carrito (con las mismas
  // comprobaciones que proponer_carrito) y al modelo se le pasa el resto para que ayude.
  const adjuntoActual = ultima.adjunto;
  let propuestosAdjunto: Set<string> | null = null;
  if (adjuntoActual?.tipo === 'lista' && adjuntoActual.lineas?.length) {
    propuestosAdjunto = new Set();
    const resueltas = adjuntoActual.lineas.filter((l) => l.propuesto && l.confianza !== 'baja');
    const ids = Array.from(new Set(resueltas.map((l) => l.propuesto!)));
    const { data: prods } = ids.length
      ? await admin.from('productos').select('id, bc_item_no, visible').in('id', ids)
      : { data: [] as any[] };
    const porId = new Map((prods || []).map((p: any) => [p.id, p]));
    const items: { producto_id?: string; codigo_bc?: string; cantidad: number }[] = [];
    const usados: string[] = [];
    for (const l of resueltas) {
      const p: any = porId.get(l.propuesto!);
      if (!p) continue;
      const cand = l.candidatos.find((c) => c.id === p.id);
      const cantidad = l.cantidad && l.cantidad > 0 ? l.cantidad : cand?.multiplo || 1;
      // El mismo artículo en varias líneas: se suman las cantidades.
      const previo = usados.indexOf(p.id);
      if (previo >= 0) {
        items[previo].cantidad += cantidad;
        continue;
      }
      if (p.visible) items.push({ producto_id: p.id, cantidad });
      // No publicado en la tienda: solo los perfiles con catálogo de BC (requiere aprobación).
      else if (catalogoBC && p.bc_item_no) items.push({ codigo_bc: p.bc_item_no, cantidad });
      else continue;
      usados.push(p.id);
    }
    if (items.length) {
      try {
        await ejecutarHerramienta('proponer_carrito', { items }, { userId: user.id, rol: perfil.rol, acciones });
        for (const a of acciones) for (const i of a.items) propuestosAdjunto.add(i.producto_id);
      } catch (e) {
        console.error('[asistente] propuesta desde adjunto', e);
      }
    }
  }

  const contenidoMensaje = (m: (typeof historial)[number], esUltima: boolean) => {
    if (!m.adjunto) return m.texto;
    const pregunta = m.texto.trim() || 'Quiero pedir este material (te adjunto la foto).';
    return `${pregunta}\n\n${textoAdjunto(m.adjunto, esUltima ? propuestosAdjunto || new Set() : null)}`;
  };

  try {
    // Bucle de herramientas (máx. 5 rondas)
    const conversacion: any[] = historial.map((m, i) => ({ role: m.rol, content: contenidoMensaje(m, i === historial.length - 1) }));
    for (let ronda = 0; ronda < 5; ronda++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, max_tokens: adjuntoActual ? 1600 : 900, system, tools: herramientas, messages: conversacion }),
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const cuerpo = await r.json();
      const bloques: any[] = cuerpo.content || [];
      texto = bloques.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      const usos = bloques.filter((c) => c.type === 'tool_use');
      if (cuerpo.stop_reason !== 'tool_use' || usos.length === 0) break;
      if (ronda === 4) break; // última ronda: se pide la respuesta final abajo
      conversacion.push({ role: 'assistant', content: bloques });
      const resultados = [];
      for (const u of usos) {
        let salida: any;
        try {
          salida = await ejecutarHerramienta(u.name, u.input, { userId: user.id, rol: perfil.rol, acciones });
        } catch (e: any) {
          salida = { error: e?.message || String(e) };
        }
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(salida).slice(0, 12000) });
      }
      conversacion.push({ role: 'user', content: resultados });
    }
    // Si se ha quedado sin texto (p. ej. terminó con una llamada a herramienta), se le
    // pide la respuesta final sin herramientas con lo que ya ha consultado.
    if (!texto) {
      const ultimaAsistente = conversacion[conversacion.length - 1];
      const mensajesFinal =
        ultimaAsistente?.role === 'user'
          ? conversacion
          : [...conversacion, { role: 'user', content: 'Responde ahora al usuario con lo que hayas encontrado.' }];
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, max_tokens: adjuntoActual ? 1600 : 900, system, tools: herramientas, tool_choice: { type: 'none' }, messages: mensajesFinal }),
      });
      if (r.ok) {
        const cuerpo = await r.json();
        texto = ((cuerpo.content || []) as any[]).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      } else console.error('[asistente] respuesta final', r.status, (await r.text()).slice(0, 200));
    }
  } catch (e: any) {
    console.error('[asistente]', e?.message || e);
    return { error: 'El asistente no está disponible ahora mismo. Inténtalo de nuevo en un momento.' };
  }
  if (!texto && acciones.length === 0) return { error: 'El asistente no ha podido responder. Prueba a reformular la pregunta.' };
  if (!texto) texto = 'Te propongo estos artículos para el carrito. Revisa las cantidades y confirma:';

  // Quitar botones a rutas no permitidas para este perfil
  texto = texto.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (m, etiqueta, destino) => {
    const d = String(destino).trim();
    return destinos.includes(d) || /^\/lineas-compras\/[0-9a-f-]{36}$/.test(d) ? m : etiqueta;
  });

  const { data: guardado } = await admin
    .from('asistente_mensajes')
    .insert({
      usuario_id: user.id,
      rol: perfil.rol,
      ruta: ruta?.slice(0, 200) || null,
      pregunta:
        (ultima.texto.slice(0, 1500) || '(sin texto)') +
        (adjuntoActual
          ? ` [${adjuntoActual.archivos} adjunto(s): ${
              adjuntoActual.tipo === 'lista'
                ? `lista de ${adjuntoActual.lineas?.length || 0} línea(s)`
                : adjuntoActual.tipo === 'producto'
                  ? `material: ${(adjuntoActual.productos || []).map((p) => p.descripcion).join('; ')}`
                  : 'no reconocido'
            }]`
          : ''),
      respuesta: texto + (acciones.length ? `\n\n[Propuesta de carrito: ${acciones.flatMap((a) => a.items.map((i) => `${i.cantidad} × ${i.nombre}`)).join('; ')}]` : ''),
    })
    .select('id')
    .maybeSingle();
  return { respuesta: texto, id: (guardado?.id as string) || null, acciones };
}

export async function valorarRespuestaAsistente(id: string, valor: 1 | -1) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  await createAdminClient().from('asistente_mensajes').update({ valoracion: valor }).eq('id', id).eq('usuario_id', user.id);
  return { success: true };
}
