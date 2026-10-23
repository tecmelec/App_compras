'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerFichaProveedorPorNumeroBC } from '@/lib/business-central';
import {
  buscarMensajeEnviadoPorAsunto,
  descargarAdjuntoGraph,
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
};

export async function obtenerRespuestasOferta(pedidoId: string) {
  if (!(await compradorOAdmin())) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const { data: peticiones, error } = await admin
    .from('peticiones_oferta')
    .select('*, profiles!peticiones_oferta_enviado_por_fkey(email)')
    .eq('pedido_id', pedidoId);
  if (error) return { error: error.message };
  const resultado: Record<string, { respuestas: RespuestaOferta[]; error?: string }> = {};
  await Promise.all(
    (peticiones || []).map(async (p: any) => {
      const buzon: string | null = p.buzon || p.profiles?.email || null;
      if (!buzon) {
        resultado[p.id] = { respuestas: [], error: 'No se sabe desde qué buzón se envió.' };
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
        if (!conversacion) {
          resultado[p.id] = { respuestas: [] };
          return;
        }
        const mensajes = await mensajesConversacionGraph(buzon, conversacion);
        const respuestas = mensajes.filter((m) => !m.esBorrador && m.de && m.de.toLowerCase() !== buzon.toLowerCase());
        resultado[p.id] = {
          respuestas: await Promise.all(
            respuestas.map(async (m) => ({
              messageId: m.id,
              fecha: m.fecha,
              de: m.de,
              deNombre: m.deNombre,
              resumen: m.resumen,
              adjuntos: m.conAdjuntos
                ? (await listarAdjuntosMensajeGraph(buzon, m.id).catch(() => []))
                    .filter((a) => !a.enLinea)
                    .map(({ id, nombre, tipo, tamano }) => ({ id, nombre, tipo, tamano }))
                : [],
            }))
          ),
        };
      } catch (e: any) {
        resultado[p.id] = { respuestas: [], error: e?.message || String(e) };
      }
    })
  );
  return { respuestas: resultado };
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
