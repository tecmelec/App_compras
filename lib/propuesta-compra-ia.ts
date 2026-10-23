import type { LineaPropuesta } from '@/lib/propuesta-compra';

// Comprador IA — Fase 1, paso 2: la IA revisa la propuesta ya calculada por las reglas
// (una sola llamada por solicitud). Solo comenta: no cambia proveedores ni precios.

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

export type NotasIA = {
  resumen: string;
  lineas: { itemId: string; nota: string; revisar: boolean }[];
};

const PROMPT = `Eres el asistente del departamento de compras de una empresa de instalaciones eléctricas en España.
Te paso la propuesta de compra de una solicitud de material: para cada línea, el artículo, la cantidad, lo que hay ahora, el proveedor y precio propuestos por unas reglas fijas, el origen del dato, la confianza y los avisos que ya han generado las reglas.

Tu tarea es revisarla como lo haría un comprador con experiencia, sin cambiar nada:
- Señala lo que parezca raro: precios fuera de lo normal para ese artículo o esa cantidad, unidades que no cuadran con la descripción (por ejemplo cable en UD en vez de metros), cantidades poco habituales, agrupaciones dudosas, compras muy antiguas, propuestas que contradicen los comentarios del solicitante.
- Explica en una frase corta por qué la propuesta tiene sentido cuando no sea evidente.
- No repitas lo que ya dicen los avisos de las reglas.
- No inventes precios, proveedores ni datos que no estén en la información.
- Si una línea no necesita comentario, no la incluyas.

Responde SOLO con JSON, sin texto antes ni después, con este formato:
{"resumen": "1-3 frases sobre la propuesta en conjunto (qué revisar primero)", "lineas": [{"itemId": "...", "nota": "máximo 25 palabras", "revisar": true|false}]}
"revisar" es true solo si el comprador debería comprobar algo antes de aplicarla.`;

export async function notasIAPropuesta(lineas: LineaPropuesta[], comentariosSolicitante: string | null): Promise<NotasIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY.');

  const datos = {
    comentarios_del_solicitante: comentariosSolicitante || null,
    lineas: lineas.map((l) => ({
      itemId: l.itemId,
      articulo: l.articulo,
      codigo_bc: l.bcItemNo,
      cantidad: l.cantidad,
      unidad: l.unidad,
      ahora: { proveedor: l.actual.proveedorNombre, precio: l.actual.precio },
      propuesta: {
        proveedor: l.propuesta.proveedorNombre || l.propuesta.proveedorNo,
        precio: l.propuesta.precio,
        precio_neto_con_pronto_pago_y_rappel: l.propuesta.precioNeto ?? null,
        origen: l.propuesta.origenTexto,
        confianza: l.propuesta.confianza || 'pedir oferta',
      },
      avisos_de_las_reglas: l.notas,
    })),
  };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1500,
      messages: [{ role: 'user', content: `${PROMPT}\n\nDatos:\n${JSON.stringify(datos)}` }],
    }),
  });
  if (!r.ok) throw new Error(`Error de la API de Claude (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const cuerpo = await r.json();
  const texto = (cuerpo.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  const limpio = texto.replace(/```json|```/g, '').trim();
  const ini = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (ini < 0 || fin < ini) throw new Error('La respuesta de la IA no tiene un formato válido.');
  const j = JSON.parse(limpio.slice(ini, fin + 1));
  const ids = new Set(lineas.map((l) => l.itemId));
  return {
    resumen: String(j.resumen || '').slice(0, 600),
    lineas: (Array.isArray(j.lineas) ? j.lineas : [])
      .filter((x: any) => x && ids.has(x.itemId) && String(x.nota || '').trim())
      .map((x: any) => ({ itemId: x.itemId, nota: String(x.nota).slice(0, 300), revisar: !!x.revisar })),
  };
}
