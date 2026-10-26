'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GUIA_APP, RUTAS_PERMITIDAS } from '@/lib/asistente/guia';

// Asistente de la app (fase 1): responde dudas de uso con la guía, según el perfil y la
// pantalla, y propone botones para ir a cada sitio ([[Texto|/ruta]]).

const MODELO = process.env.ANTHROPIC_MODEL_ASISTENTE || 'claude-haiku-5-5';
const ROLES: Record<string, string> = { usuario: 'Usuario', responsable: 'Responsable', comprador: 'Comprador', admin: 'Admin' };

export type MensajeAsistente = { rol: 'user' | 'assistant'; texto: string };

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

  const historial = mensajes.filter((m) => m.texto.trim()).slice(-12);
  const ultima = historial[historial.length - 1];
  if (!ultima || ultima.rol !== 'user') return { error: 'Escribe tu pregunta.' };
  if (ultima.texto.length > 1500) return { error: 'La pregunta es demasiado larga.' };

  const rutas = RUTAS_PERMITIDAS.filter((r) => r.roles.includes(perfil.rol)).map((r) => r.ruta);
  const system = `Eres el asistente de ayuda de la app de compras de Tecmelec (empresa de instalaciones eléctricas en España). Ayudas a las personas a usar la app, paso a paso y en español sencillo, tuteando.

Quién pregunta: ${perfil.nombre_completo || 'un usuario'}, perfil ${ROLES[perfil.rol] || perfil.rol}.
Pantalla en la que está ahora: ${ruta || 'desconocida'}.

Reglas:
- Responde SOLO con lo que dice la guía de abajo. Si algo no está en la guía, di que no lo sabes y sugiere contactar con compras (recuadro "¿Necesitas ayuda?" del menú). No inventes botones, pantallas ni funciones.
- Ten en cuenta el perfil: no expliques funciones que su perfil no puede usar (si pregunta por ellas, dile que su perfil no tiene acceso).
- Sé breve: pasos numerados cortos, de uno en uno si es un proceso largo, y pregunta si quiere seguir.
- Cuando indiques ir a una pantalla, añade un botón con la sintaxis [[Texto del botón|/ruta]] en su propia línea. Solo puedes usar estas rutas: ${rutas.join(', ')}.
- Usa los nombres exactos de los botones y pantallas entre comillas, como aparecen en la app.
- No pidas ni muestres datos personales, contraseñas ni datos de otras personas. No puedes hacer acciones en la app: solo explicas.

GUÍA DE LA APP:
${GUIA_APP}`;

  let texto = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        system,
        messages: historial.map((m) => ({ role: m.rol, content: m.texto })),
      }),
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const cuerpo = await r.json();
    texto = (cuerpo.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
  } catch (e: any) {
    console.error('[asistente]', e?.message || e);
    return { error: 'El asistente no está disponible ahora mismo. Inténtalo de nuevo en un momento.' };
  }
  if (!texto) return { error: 'El asistente no ha podido responder. Prueba a reformular la pregunta.' };

  // Quitar botones a rutas no permitidas para este perfil
  texto = texto.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (m, etiqueta, destino) => (rutas.includes(String(destino).trim()) ? m : etiqueta));

  const { data: guardado } = await admin
    .from('asistente_mensajes')
    .insert({ usuario_id: user.id, rol: perfil.rol, ruta: ruta?.slice(0, 200) || null, pregunta: ultima.texto.slice(0, 1500), respuesta: texto })
    .select('id')
    .maybeSingle();
  return { respuesta: texto, id: (guardado?.id as string) || null };
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
