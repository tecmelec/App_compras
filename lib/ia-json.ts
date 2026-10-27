// Llamada a Claude que debe devolver JSON, con recuperación de errores:
//  - si la respuesta se corta por longitud, se repite con más margen;
//  - si el JSON no es válido (p. ej. comillas sin escapar como 1/2" o REF."X"), se
//    intenta reparar y, si no, se le pide a Claude que lo corrija.

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

async function llamar(content: any[], maxTokens: number): Promise<{ texto: string; cortado: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY en Vercel.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error(`Error de la API de Claude (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const cuerpo = await r.json();
  return {
    texto: (cuerpo.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n'),
    cortado: cuerpo.stop_reason === 'max_tokens',
  };
}

function recortar(texto: string): string {
  const limpio = texto.replace(/```json|```/g, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin < inicio) throw new Error('La respuesta del análisis no tiene un formato válido.');
  return limpio.slice(inicio, fin + 1);
}

// Reparación local: escapa comillas dobles que están dentro de un texto (las que no van
// seguidas de , } ] : ni precedidas de { [ , :), y quita comas finales.
export function reparar(json: string): string {
  let salida = '';
  let enTexto = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (c === '\\' && enTexto) {
      salida += c + (json[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') {
      if (!enTexto) {
        enTexto = true;
        salida += c;
        continue;
      }
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j])) j++;
      const sig = json[j];
      if (sig === undefined || sig === ',' || sig === '}' || sig === ']' || sig === ':') {
        enTexto = false;
        salida += c;
      } else salida += '\\"';
      continue;
    }
    if (enTexto && (c === '\n' || c === '\r')) {
      salida += c === '\n' ? '\\n' : '';
      continue;
    }
    salida += c;
  }
  return salida.replace(/,\s*([}\]])/g, '$1');
}

export async function claudeJSON(content: any[], maxTokens: number): Promise<any> {
  let { texto, cortado } = await llamar(content, maxTokens);
  if (cortado) ({ texto, cortado } = await llamar(content, Math.min(maxTokens * 2, 16000)));
  const bruto = recortar(texto);
  try {
    return JSON.parse(bruto);
  } catch {
    /* sigue */
  }
  try {
    return JSON.parse(reparar(bruto));
  } catch {
    /* sigue */
  }
  const corregido = await llamar(
    [
      {
        type: 'text',
        text:
          'Este JSON no es válido. Devuélvelo corregido y completo, sin cambiar los datos: escapa las comillas dobles dentro de los textos (\\") y elimina lo que sobre. Responde SOLO con el JSON.\n\n' +
          bruto,
      },
    ],
    Math.min(Math.max(maxTokens, 4000), 16000)
  );
  const r = recortar(corregido.texto);
  try {
    return JSON.parse(r);
  } catch {
    return JSON.parse(reparar(r));
  }
}
