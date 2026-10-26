import { createClient } from '@/lib/supabase/server';
import ConfiguracionClient from './ConfiguracionClient';
import ParametrosPropuestaCompra from './ParametrosPropuestaCompra';
import AsistenteConfig from './AsistenteConfig';
import { leerParametrosPropuesta } from '@/lib/propuesta-compra';

export default async function ConfiguracionPage() {
  const supabase = createClient();

  const { data: config } = await supabase
    .from('configuracion')
    .select('*')
    .eq('id', 1)
    .single();

  const parametros = await leerParametrosPropuesta();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Configuración</h1>
      <p className="text-slate text-sm mb-6">Ajustes generales de la plataforma.</p>

      <ConfiguracionClient limiteInicial={config?.limite_aprobacion ?? 200} />
      <ParametrosPropuestaCompra inicial={parametros} />
      <AsistenteConfig inicial={(config as any)?.asistente_activo !== false} />
    </div>
  );
}
