'use client';

import { useEffect, useRef } from 'react';

// Filtros de las tablas guardados durante la sesión del navegador (sessionStorage): al
// entrar al detalle de una solicitud y volver, la tabla conserva sus filtros y su orden.
// Se borran al cambiar de sección desde el menú lateral (borrarFiltrosGuardados).

const PREFIJO = 'filtros:';

export function useFiltrosEnSesion<T>(clave: string, valor: T, setValor: (v: T) => void) {
  const cargado = useRef(false);

  // Al montar, recupera lo guardado
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREFIJO + clave);
      if (raw) setValor(JSON.parse(raw));
    } catch {}
    cargado.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Y guarda cada cambio (después de haber recuperado lo anterior)
  useEffect(() => {
    if (!cargado.current) return;
    try {
      sessionStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    } catch {}
  }, [clave, valor]);
}

export function borrarFiltrosGuardados() {
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(PREFIJO)) sessionStorage.removeItem(k);
    }
  } catch {}
}
