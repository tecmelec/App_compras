'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearEstado, eliminarEstado } from '@/app/actions/catalogo';

type Estado = { id: number; nombre: string; orden: number };

export default function EstadosClient({ estados }: { estados: Estado[] }) {
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const siguienteOrden = (estados[estados.length - 1]?.orden || 0) + 1;

  async function handleAgregar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);

    const resultado = await crearEstado(nombre.trim(), siguienteOrden);

    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setNombre('');
    router.refresh();
  }

  async function handleEliminar(id: number) {
    if (!confirm('¿Eliminar este estado?')) return;
    const resultado = await eliminarEstado(id);
    if (resultado.error) {
      alert(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="max-w-md">
      <div className="bg-white border border-borde rounded-lg divide-y divide-borde mb-4">
        {estados.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-grafito">{e.nombre}</span>
            <button onClick={() => handleEliminar(e.id)} className="text-rojo hover:underline">
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Nombre del nuevo estado"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAgregar()}
        />
        <button onClick={handleAgregar} disabled={guardando} className="btn-primary shrink-0">
          Añadir
        </button>
      </div>

      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </div>
  );
}
