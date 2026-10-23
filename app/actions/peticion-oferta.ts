'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerFichaProveedorPorNumeroBC } from '@/lib/business-central';
import {
  buscarMensajeEnviadoPorAsunto,
  buscarMensajesGraph,
  descargarAdjuntoGraph,
  mensajesConAdjuntosDesdeGraph,
  enviarEmailConAdjuntoGraph,
  listarAdjuntosMensajeGraph,
  mensajesConversacionGraph,
} from '@/lib/microsoft-graph';
import { sugerirProveedoresOferta, type GrupoPeticion, type LineaPeticion } from '@/lib/peticion-oferta';

// Comprador IA — Fase 1, paso 3: peticiones de oferta. Un email por proveedor, desde el
// buzón del comprador (Microsoft Graph). Solo comprador/admin.

async function compradorOAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo, nombre_completo').eq('id', user.id).single();
  if (!perfil?.activo || !['comprador', 'admin'].includes(perfil.rol)) return null;
  return { user, nombre: (perfil.nombre_completo as string) || '' };
}

async function emailsDeProveedor(bcNo: string | null): Promise<string[]> {
  if (!bcNo) return [];
  try {
    const ficha = await obtenerFichaProveedorPorNumeroBC(bcNo);
    return (ficha?.E_Mail || '')
      .split(/[;,]/)
      .map((e: string) => e.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export type ContextoPeticion = {
  numeroApp: string;
  proyecto: string;
  fechaRequerida: string | null;
  direccion: string;
  firma: string;
};

export async function prepararPeticionesOferta(pedidoId: string, itemIds: string[]) {
  const quien = await compradorOAdmin();
  if (!quien) return { error: 'No autorizado.' };
  if (itemIds.length === 0) return { error: 'Elige al menos una línea.' };
  try {
    const admin = createAdminClient();
    const [{ lineas, grupos }, { data: pedido }] = await Promise.all([
      sugerirProveedoresOferta(pedidoId, itemIds),
      admin
        .from('pedidos')
        .select('numero_app, fecha_requerida, proyectos(bc_job_no, descripcion), direcciones(direccion, codigo_postal, ciudad)')
        .eq('id', pedidoId)
        .single(),
    ]);
    const conEmails = await Promise.all(
      grupos.map(async (g: GrupoPeticion) => ({ ...g, emails: await emailsDeProveedor(g.proveedorNo) }))
    );
    const p: any = pedido || {};
    const contexto: ContextoPeticion = {
      numeroApp: p.numero_app || '',
      proyecto: p.proyectos ? `${p.proyectos.bc_job_no} — ${p.proyectos.descripcion || ''}`.trim() : '',
      fechaRequerida: p.fecha_requerida || null,
      direccion: p.direcciones
        ? [p.direcciones.direccion, p.direcciones.codigo_postal, p.direcciones.ciudad].filter(Boolean).join(', ')
        : '',
      firma: quien.nombre,
    };
    return { lineas: lineas as LineaPeticion[], grupos: conEmails, contexto };
  } catch (e: any) {
    return { error: 'No se pudieron preparar las peticiones: ' + (e?.message || e) };
  }
}

// Para un proveedor que el comprador añade a mano.
export async function datosProveedorOferta(proveedorId: string) {
  if (!(await compradorOAdmin())) return { error: 'No autorizado.' };
  const { data: p } = await createAdminClient().from('proveedores').select('id, bc_proveedor_no, nombre').eq('id', proveedorId).maybeSingle();
  if (!p) return { error: 'Proveedor no encontrado.' };
  return { proveedorId: p.id as string, proveedorNo: p.bc_proveedor_no as string, proveedorNombre: (p.nombre as string) || '', emails: await emailsDeProveedor(p.bc_proveedor_no) };
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function enviarPeticionOferta(datos: {
  pedidoId: string;
  propuestaId: string | null;
  proveedorId: string;
  proveedorNombre: string;
  destinatarios: string[];
  cc: string[];
  asunto: string;
  cuerpo: string;
  itemIds: string[];
  sugerido: boolean;
}) {
  const quien = await compradorOAdmin();
  if (!quien) return { error: 'No autorizado.' };
  if (!quien.user.email) return { error: 'Tu usuario no tiene email: no se puede enviar en tu nombre.' };
  const destinatarios = datos.destinatarios.map((e) => e.trim()).filter(Boolean);
  const cc = datos.cc.map((e) => e.trim()).filter(Boolean);
  if (destinatarios.length === 0) return { error: 'Añade al menos un destinatario.' };
  const malos = [...destinatarios, ...cc].filter((e) => !EMAIL_OK.test(e));
  if (malos.length) return { error: `Email no válido: ${malos.join(', ')}` };
  if (!datos.asunto.trim() || !datos.cuerpo.trim()) return { error: 'Falta el asunto o el mensaje.' };
  if (datos.itemIds.length === 0) return { error: 'Elige al menos un artículo para este proveedor.' };

  const admin = createAdminClient();
  const { data: items } = await admin
    .from('pedido_items')
    .select('id, cantidad, productos(nombre, bc_item_no, unidad_medida)')
    .eq('pedido_id', datos.pedidoId)
    .in('id', datos.itemIds);
  if (!items || items.length !== datos.itemIds.length) return { error: 'Alguna línea no pertenece a esta solicitud.' };

  // El mensaje se escribe como texto; se envía en HTML para poner en negrita el Nº de
  // solicitud (p. ej. APP-2600056) allí donde aparezca.
  const { data: ped } = await admin.from('pedidos').select('numero_app').eq('id', datos.pedidoId).maybeSingle();
  const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = escapar(datos.cuerpo);
  if (ped?.numero_app) html = html.split(escapar(ped.numero_app)).join(`<strong>${escapar(ped.numero_app)}</strong>`);
  html = `<div style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1C2126;">${html.replace(/\r?\n/g, '<br/>')}</div>`;

  let envio: { messageId: string; conversationId: string | null };
  try {
    envio = await enviarEmailConAdjuntoGraph({
      buzon: quien.user.email,
      destinatarios,
      cc,
      asunto: datos.asunto.trim(),
      cuerpo: html,
      cuerpoEsHtml: true,
      nombreArchivo: '',
      contenidoBase64: '',
    });
  } catch (e: any) {
    return { error: 'No se pudo enviar: ' + (e?.message || e) };
  }

  const fila: Record<string, any> = {
    pedido_id: datos.pedidoId,
    propuesta_compra_id: datos.propuestaId,
    proveedor_id: datos.proveedorId,
    proveedor_nombre: datos.proveedorNombre,
    destinatarios,
    cc,
    asunto: datos.asunto.trim(),
    cuerpo: datos.cuerpo,
    item_ids: datos.itemIds,
    lineas: (items || []).map((it: any) => ({
      item_id: it.id,
      bc_item_no: it.productos?.bc_item_no || null,
      articulo: it.productos?.nombre || '',
      cantidad: Number(it.cantidad),
      unidad: it.productos?.unidad_medida || '',
    })),
    sugerido: datos.sugerido,
    enviado_por: quien.user.id,
    message_id: envio.messageId || null,
    conversation_id: envio.conversationId,
    buzon: quien.user.email,
  };
  let { error } = await admin.from('peticiones_oferta').insert(fila);
  if (error && /buzon/.test(error.message || '')) {
    delete fila.buzon; // migración 20261023140000 aún sin aplicar
    ({ error } = await admin.from('peticiones_oferta').insert(fila));
  }
  if (error) {
    return { success: true, aviso: 'Enviado, pero no se pudo registrar en la solicitud: ' + error.message };
  }
  revalidatePath(`/comprador/${datos.pedidoId}`);
  return { success: true };
}

// ---- Respuestas de los proveedores (lee el hilo de cada petición en el buzón) ----

export type RespuestaOferta = {
  messageId: string;
  fecha: string;
  de: string;
  deNombre: string;
  resumen: string;
  adjuntos: { id: string; nombre: string; tipo: string; tamano: number }[];
  // 'hilo' = respuesta al email; 'numero' = email nuevo que menciona el Nº de solicitud;
  // 'adjunto' = email nuevo cuyo adjunto (PDF) contiene el Nº de solicitud.
  origen: 'hilo' | 'numero' | 'adjunto';
};

const DOMINIOS_PUBLICOS = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|gmx|protonmail|telefonica)\./i;
const dominio = (email: string) => (email.split('@')[1] || '').toLowerCase();

// Texto de un PDF (capa de texto) para buscar el Nº de solicitud.
async function textoPDF(base64: string): Promise<string> {
  try {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')));
    const partes: string[] = [];
    for (let k = 1; k <= Math.min(pdf.numPages, 10); k++) {
      const c = await (await pdf.getPage(k)).getTextContent();
      partes.push((c.items as any[]).map((it) => (typeof it.str === 'string' ? it.str : '')).join(' '));
    }
    return partes.join(' ');
  } catch {
    return '';
  }
}
const contieneNumero = (texto: string, numeroApp: string) =>
  texto.replace(/\s+/g, '').toUpperCase().includes(numeroApp.replace(/\s+/g, '').toUpperCase());

export async function obtenerRespuestasOferta(pedidoId: string) {
  if (!(await compradorOAdmin())) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const [{ data: peticiones, error }, { data: ped }] = await Promise.all([
    admin.from('peticiones_oferta').select('*, profiles!peticiones_oferta_enviado_por_fkey(email)').eq('pedido_id', pedidoId),
    admin.from('pedidos').select('numero_app').eq('id', pedidoId).maybeSingle(),
  ]);
  if (error) return { error: error.message };
  const numeroApp: string = (ped as any)?.numero_app || '';
  const resultado: Record<string, { respuestas: RespuestaOferta[]; error?: string }> = {};
  const otras: RespuestaOferta[] = []; // mencionan el Nº pero no son de ningún proveedor consultado
  const vistos = new Set<string>(); // mensajes ya asignados
  const conBuzon = (peticiones || []).map((p: any) => ({ ...p, _buzon: (p.buzon || p.profiles?.email || null) as string | null }));

  const adjuntosDe = async (buzon: string, messageId: string) =>
    (await listarAdjuntosMensajeGraph(buzon, messageId).catch(() => []))
      .filter((a) => !a.enLinea)
      .map(({ id, nombre, tipo, tamano }) => ({ id, nombre, tipo, tamano }));

  // 1. Respuestas en el mismo hilo
  await Promise.all(
    conBuzon.map(async (p: any) => {
      const buzon = p._buzon;
      resultado[p.id] = { respuestas: [] };
      if (!buzon) {
        resultado[p.id].error = 'No se sabe desde qué buzón se envió.';
        return;
      }
      try {
        let conversacion = p.conversation_id as string | null;
        if (!conversacion) {
          const encontrado = await buscarMensajeEnviadoPorAsunto(buzon, p.asunto).catch(() => null);
          if (encontrado?.conversationId) {
            conversacion = encontrado.conversationId;
            await admin.from('peticiones_oferta').update({ conversation_id: conversacion, message_id: encontrado.messageId }).eq('id', p.id);
          }
        }
        if (!conversacion) return;
        const mensajes = await mensajesConversacionGraph(buzon, conversacion);
        const resp = mensajes.filter((m) => !m.esBorrador && m.de && m.de.toLowerCase() !== buzon.toLowerCase());
        for (const m of resp) vistos.add(m.id);
        resultado[p.id].respuestas = await Promise.all(
          resp.map(async (m) => ({
            messageId: m.id,
            fecha: m.fecha,
            de: m.de,
            deNombre: m.deNombre,
            resumen: m.resumen,
            adjuntos: m.conAdjuntos ? await adjuntosDe(buzon, m.id) : [],
            origen: 'hilo' as const,
          }))
        );
      } catch (e: any) {
        resultado[p.id].error = e?.message || String(e);
      }
    })
  );

  // 2. Emails nuevos (fuera del hilo), por buzón: solo se muestran si mencionan el Nº de
  //    solicitud en el asunto o el texto, o si un PDF adjunto lo contiene.
  if (numeroApp) {
    const porBuzon = new Map<string, any[]>();
    for (const p of conBuzon) if (p._buzon) porBuzon.set(p._buzon, [...(porBuzon.get(p._buzon) || []), p]);
    for (const [buzon, lista] of Array.from(porBuzon.entries())) {
      try {
        const desdeMs = Math.min(...lista.map((p) => new Date(p.enviado_en).getTime()));
        const desde = new Date(desdeMs).toISOString();
        const yo = buzon.toLowerCase();
        // ¿A qué petición pertenece un remitente? Por dirección exacta o, si no es un
        // dominio público (gmail…), por dominio del proveedor.
        const peticionDe = (email: string) => {
          const e = email.toLowerCase();
          const d = dominio(e);
          return (
            lista.find((p) => (p.destinatarios || []).some((x: string) => x.toLowerCase() === e)) ||
            (!DOMINIOS_PUBLICOS.test(d) ? lista.find((p) => (p.destinatarios || []).some((x: string) => dominio(x) === d)) : undefined)
          );
        };
        const anadir = async (m: any, origen: 'numero' | 'adjunto') => {
          vistos.add(m.id);
          const r: RespuestaOferta = {
            messageId: m.id,
            fecha: m.fecha,
            de: m.de,
            deNombre: m.deNombre,
            resumen: m.resumen,
            adjuntos: m.conAdjuntos ? await adjuntosDe(buzon, m.id) : [],
            origen,
          };
          const p = peticionDe(m.de);
          if (p) resultado[p.id].respuestas.push(r);
          else otras.push({ ...r, _peticion: lista[0].id } as any);
        };

        // 2a. Mencionan el Nº de solicitud
        const conNumero = (await buscarMensajesGraph(buzon, numeroApp)).filter(
          (m) => !vistos.has(m.id) && m.de && m.de.toLowerCase() !== yo && new Date(m.fecha).getTime() >= desdeMs && contieneNumero(`${m.asunto} ${m.resumen}`, numeroApp)
        );
        for (const m of conNumero) await anadir(m, 'numero');

        // 2b. De los proveedores consultados, con PDF adjunto que contiene el Nº
        const candidatos = (await mensajesConAdjuntosDesdeGraph(buzon, desde))
          .filter((m) => !vistos.has(m.id) && m.de && m.de.toLowerCase() !== yo && peticionDe(m.de))
          .slice(0, 20);
        for (const m of candidatos) {
          const adj = await adjuntosDe(buzon, m.id);
          let coincide = false;
          for (const a of adj.filter((x) => x.tipo === 'application/pdf' || /\.pdf$/i.test(x.nombre)).slice(0, 3)) {
            if (a.tamano > 10 * 1024 * 1024) continue;
            const { data: cache } = await admin
              .from('ofertas_escaneadas')
              .select('coincide')
              .eq('message_id', m.id)
              .eq('attachment_id', a.id)
              .eq('numero_app', numeroApp)
              .maybeSingle();
            let si: boolean;
            if (cache) si = !!cache.coincide;
            else {
              const d = await descargarAdjuntoGraph(buzon, m.id, a.id).catch(() => null);
              si = !!d && contieneNumero(await textoPDF(d.base64), numeroApp);
              await admin
                .from('ofertas_escaneadas')
                .upsert({ message_id: m.id, attachment_id: a.id, numero_app: numeroApp, coincide: si }, { onConflict: 'message_id,attachment_id,numero_app' });
            }
            if (si) {
              coincide = true;
              break;
            }
          }
          if (coincide) await anadir(m, 'adjunto');
        }
      } catch (e: any) {
        console.error('[obtenerRespuestasOferta] búsqueda de emails nuevos:', e?.message || e);
      }
    }
  }

  for (const k of Object.keys(resultado)) resultado[k].respuestas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { respuestas: resultado, otras };
}

const MAX_ADJUNTO_BYTES = 15 * 1024 * 1024;

export async function descargarAdjuntoOferta(peticionId: string, messageId: string, attachmentId: string) {
  if (!(await compradorOAdmin())) return { error: 'No autorizado.' };
  const { data: p } = await createAdminClient()
    .from('peticiones_oferta')
    .select('*, profiles!peticiones_oferta_enviado_por_fkey(email)')
    .eq('id', peticionId)
    .maybeSingle();
  const buzon: string | null = (p as any)?.buzon || (p as any)?.profiles?.email || null;
  if (!p || !buzon) return { error: 'Petición no encontrada.' };
  try {
    const a = await descargarAdjuntoGraph(buzon, messageId, attachmentId);
    if (a.base64.length * 0.75 > MAX_ADJUNTO_BYTES) return { error: 'El adjunto es demasiado grande (máx. 15 MB).' };
    return a;
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
}
