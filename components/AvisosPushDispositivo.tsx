'use client';

import { useEffect, useState } from 'react';
import { guardarSuscripcionPush, eliminarSuscripcionPush, enviarPushDePrueba } from '@/app/actions/push';

// Activar / desactivar los avisos push (notificaciones del móvil u ordenador)
// en ESTE dispositivo. Se muestra dentro del panel de la campana.

type Estado = 'cargando' | 'no-soportado' | 'iphone-sin-instalar' | 'bloqueado' | 'inactivo' | 'activo';

function claveABytes(base64: string) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(b64);
  return Uint8Array.from(Array.from(bruto).map((c) => c.charCodeAt(0)));
}

function esIphone() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function esAppInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

async function registroSW() {
  return (await navigator.serviceWorker.getRegistration('/')) || navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export default function AvisosPushDispositivo() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!soportado) {
        setEstado(esIphone() && !esAppInstalada() ? 'iphone-sin-instalar' : 'no-soportado');
        return;
      }
      if (Notification.permission === 'denied') {
        setEstado('bloqueado');
        return;
      }
      try {
        const reg = await registroSW();
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub && Notification.permission === 'granted' ? 'activo' : 'inactivo');
      } catch {
        setEstado('inactivo');
      }
    })();
  }, []);

  async function activar() {
    setOcupado(true);
    setMensaje(null);
    try {
      const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!clave) throw new Error('Los avisos aún no están configurados en el servidor.');
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo');
        return;
      }
      const reg = await registroSW();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) }));
      const json = sub.toJSON() as any;
      const r = await guardarSuscripcionPush({ endpoint: json.endpoint, keys: json.keys }, navigator.userAgent);
      if (r.error) throw new Error(r.error);
      setEstado('activo');
      setMensaje('Avisos activados en este dispositivo.');
    } catch (e: any) {
      setMensaje(e?.message || 'No se pudieron activar los avisos.');
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setMensaje(null);
    try {
      const reg = await registroSW();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await eliminarSuscripcionPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado('inactivo');
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setMensaje(null);
    const r = await enviarPushDePrueba();
    setOcupado(false);
    setMensaje(r.error || 'Aviso de prueba enviado. Debería llegarte en unos segundos.');
  }

  if (estado === 'cargando') return null;

  return (
    <div className="px-4 py-3 border-t border-borde bg-fondo text-xs text-slate">
      {estado === 'activo' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-marca font-medium">
            <span className="w-2 h-2 rounded-full bg-marca" /> Avisos al móvil activados en este dispositivo
          </span>
          <button type="button" onClick={probar} disabled={ocupado} className="text-marca hover:underline disabled:opacity-50">
            Probar
          </button>
          <button type="button" onClick={desactivar} disabled={ocupado} className="text-slate hover:text-grafito hover:underline disabled:opacity-50">
            Desactivar
          </button>
        </div>
      )}
      {estado === 'inactivo' && (
        <div className="flex items-center justify-between gap-2">
          <span>Recibe estos avisos también en tu móvil u ordenador.</span>
          <button
            type="button"
            onClick={activar}
            disabled={ocupado}
            className="shrink-0 bg-marca text-white rounded-md px-2.5 py-1 font-medium disabled:opacity-50"
          >
            {ocupado ? 'Activando…' : 'Activar avisos'}
          </button>
        </div>
      )}
      {estado === 'bloqueado' && (
        <p>
          Los avisos están bloqueados para esta web. Para recibirlos, permite las notificaciones de la Tienda Tecmelec en
          los ajustes del navegador o del móvil.
        </p>
      )}
      {estado === 'iphone-sin-instalar' && (
        <p>
          En iPhone, para recibir avisos instala primero la app: en Safari pulsa <strong>Compartir</strong> →{' '}
          <strong>Añadir a pantalla de inicio</strong>, ábrela desde ese icono y activa aquí los avisos.
        </p>
      )}
      {estado === 'no-soportado' && <p>Este navegador no admite avisos push.</p>}
      {mensaje && <p className="mt-1.5 text-grafito">{mensaje}</p>}
    </div>
  );
}
