import { createClient } from '@/lib/supabase/server';
import ConfiguracionClient from './ConfiguracionClient';

export default async function ConfiguracionPage() {
  const supabase = createClient();

  const { data: config } = await supabase
    .from('configuracion')
    .select('limite_aprobacion')
    .eq('id', 1)
    .single();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Configuración</h1>
      <p className="text-slate text-sm mb-6">Ajustes generales de la plataforma.</p>

      <ConfiguracionClient limiteInicial={config?.limite_aprobacion ?? 200} />
    </div>
  );
}
