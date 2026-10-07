'use client';

import { useState } from 'react';
import { diagnosticoJefeObraProyecto } from '@/app/actions/business-central';

// Diagnóstico temporal: muestra el jefe de obra (Project Manager) de un proyecto en BC,
// su Id. de seguridad de usuario y qué usuario de la app aprobaría sus solicitudes.
export default function DiagnosticoJefeObra() {
  const [jobNo, setJobNo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  async function consultar() {
    setCargando(true);
    setResultado(await diagnosticoJefeObraProyecto(jobNo));
    setCargando(false);
  }

  const r = resultado;
  const aprueba =
    r?.perfil && r.perfil.activo && (r.perfil.rol === 'responsable' || r.perfil.rol === 'admin');

  return (
    <div className="mb-6 border border-gray-200 rounded-md p-3 max-w-xl text-sm">
      <p className="font-medium text-grafito mb-2">Diagnóstico: jefe de obra en BC</p>
      <div className="flex gap-2">
        <input
          value={jobNo}
          onChange={(e) => setJobNo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && consultar()}
          placeholder="Nº proyecto (ej. E260034)"
          className="input flex-1"
        />
        <button onClick={consultar} disabled={cargando} className="btn-secondary">
          {cargando ? 'Consultando…' : 'Consultar'}
        </button>
      </div>
      {r?.error && <p className="text-rojo mt-2">{r.error}</p>}
      {r?.success && (
        <div className="mt-2 space-y-1 text-slate">
          <p>Jefe de obra (BC): <b>{r.userName || '— sin asignar —'}</b></p>
          <p>Id. de seguridad: <span className="font-mono">{r.userSecurityId || '—'}</span></p>
          <p>
            Usuario en la app:{' '}
            {r.perfil ? `${r.perfil.nombre_completo} (${r.perfil.rol}${r.perfil.activo ? '' : ', inactivo'})` : 'no dado de alta'}
          </p>
          <p className={aprueba ? 'text-verde' : 'text-amber-700'}>
            {aprueba
              ? 'Las solicitudes de este proyecto las aprobará este usuario.'
              : 'Las solicitudes de este proyecto las aprobará el responsable asignado al solicitante.'}
          </p>
        </div>
      )}
    </div>
  );
}
