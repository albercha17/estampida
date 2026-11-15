// Comunicación PC <-> móviles. Por defecto usa Supabase Realtime (canal de difusión por sala).
// Con ?local=1 usa BroadcastChannel (mismo navegador): sirve para probar sin internet.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const modoLocal = new URLSearchParams(location.search).has('local');

export async function conectar(sala, alRecibir, alEstado = () => {}) {
  const nombre = 'estampida-' + sala.toUpperCase();
  if (modoLocal || !window.supabase) {
    const bc = new BroadcastChannel(nombre);
    bc.onmessage = e => alRecibir(e.data);
    alEstado('conectado');
    return { enviar: m => bc.postMessage(m), cerrar: () => bc.close(), local: true };
  }
  const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 30 } },
  });
  const canal = cliente.channel(nombre, { config: { broadcast: { self: false, ack: false } } });
  canal.on('broadcast', { event: 'm' }, ({ payload }) => alRecibir(payload));
  await new Promise((ok, mal) => {
    let hecho = false;
    canal.subscribe(st => {
      alEstado(st === 'SUBSCRIBED' ? 'conectado' : st.toLowerCase());
      if (st === 'SUBSCRIBED' && !hecho) { hecho = true; ok(); }
      if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && !hecho) { hecho = true; mal(new Error(st)); }
    });
  });
  return {
    enviar: m => canal.send({ type: 'broadcast', event: 'm', payload: m }),
    cerrar: () => cliente.removeChannel(canal),
    local: false,
  };
}

export function codigoSala() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
}

export function idPropio() {
  let id = null;
  try { id = localStorage.getItem('estampida-id'); } catch {}
  if (!id) {
    id = 'j' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem('estampida-id', id); } catch {}
  }
  return id;
}

export async function cargarPersonajes() {
  const r = await fetch('personajes/personajes.json', { cache: 'no-cache' });
  const d = await r.json();
  return d.personajes;
}
