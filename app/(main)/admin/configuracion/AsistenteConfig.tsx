'use client';

import { useState } from 'react';
import Link from 'next/link';
import { actualizarAsistenteActivo } from '@/app/actions/catalogo';

export default function AsistenteConfig({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="bg-white border border-borde rounded-lg p-5 max-w-md mt-6">
      <h2 className="font-medium text-grafito mb-1">Asistente de la app</h2>
      <p className="text-sm text-slate mb-3">Chat de ayuda para usar la app (botón &quot;?&quot; y &quot;Asistente&quot; del menú).</p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={activo}
          disabled={guardando}
          onChange={async (e) => {
            const v = e.target.checked;
            setGuardando(true);
            setError(null);
            const r = await actualizarAsistenteActivo(v);
            setGuardando(false);
            if (r.error) setError(r.error);
            else setActivo(v);
          }}
        />
        <span className="text-sm text-grafito">Asistente activado</span>
      </label>
      {error && <p className="text-sm text-rojo mt-2">{error}</p>}
      <Link href="/admin/asistente" className="inline-block text-sm text-marca hover:underline mt-3">
        Ver preguntas y valoraciones →
      </Link>
    </div>
  );
}
