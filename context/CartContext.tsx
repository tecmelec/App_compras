'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { descartarListaFoto } from '@/app/actions/lista-foto';

export type CartItem = {
  producto_id: string;
  nombre: string;
  imagen_url: string | null;
  cantidad: number;
  multiplo_compra?: number | null;
  unidad_medida?: string | null;
};

type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'cantidad'>, cantidad: number) => void;
  updateCantidad: (producto_id: string, cantidad: number) => void;
  removeItem: (producto_id: string) => void;
  clear: () => void;
  totalItems: number;
  // Listas en foto (carrito desde foto) cuyos artículos están en el carrito
  listasFoto: string[];
  addListaFoto: (id: string) => void;
  removeListaFoto: (id: string) => void;
};

const CartContext = createContext<CartContextType | null>(null);

function storageKey(userId: string) {
  return `tecmelec_carrito_${userId}`;
}

function storageKeyListas(userId: string) {
  return `tecmelec_carrito_listas_foto_${userId}`;
}

export function CartProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [listasFoto, setListasFoto] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Carga el carrito de ESTE usuario específico (nunca el de otro que haya usado el mismo navegador)
  useEffect(() => {
    setLoaded(false);
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw) {
      try {
        setItems(JSON.parse(raw));
      } catch {
        setItems([]);
      }
    } else {
      setItems([]);
    }
    try {
      const rawListas = window.localStorage.getItem(storageKeyListas(userId));
      setListasFoto(rawListas ? JSON.parse(rawListas) : []);
    } catch {
      setListasFoto([]);
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(items));
      window.localStorage.setItem(storageKeyListas(userId), JSON.stringify(listasFoto));
    }
  }, [items, listasFoto, loaded, userId]);

  function addItem(item: Omit<CartItem, 'cantidad'>, cantidad: number) {
    setItems((prev) => {
      const existing = prev.find((i) => i.producto_id === item.producto_id);
      if (existing) {
        return prev.map((i) =>
          i.producto_id === item.producto_id ? { ...i, ...item, cantidad: i.cantidad + cantidad } : i
        );
      }
      return [...prev, { ...item, cantidad }];
    });
  }

  function updateCantidad(producto_id: string, cantidad: number) {
    if (cantidad <= 0) {
      removeItem(producto_id);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.producto_id === producto_id ? { ...i, cantidad } : i))
    );
  }

  function removeItem(producto_id: string) {
    setItems((prev) => prev.filter((i) => i.producto_id !== producto_id));
  }

  function clear() {
    setItems([]);
    setListasFoto([]);
  }

  function addListaFoto(id: string) {
    setListasFoto((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  // Quita la foto del carrito y la borra (si aún no se ha enviado en una solicitud).
  function removeListaFoto(id: string) {
    setListasFoto((prev) => prev.filter((x) => x !== id));
    descartarListaFoto(id).catch(() => {});
  }

  // Si se vacía el carrito quitando artículos, las fotos dejan de tener sentido.
  useEffect(() => {
    if (loaded && items.length === 0 && listasFoto.length > 0) {
      const ids = listasFoto;
      setListasFoto([]);
      ids.forEach((id) => descartarListaFoto(id).catch(() => {}));
    }
  }, [loaded, items.length, listasFoto]);

  // Nº de artículos distintos en el carrito (no la suma de unidades)
  const totalItems = items.length;

  return (
    <CartContext.Provider value={{ items, addItem, updateCantidad, removeItem, clear, totalItems, listasFoto, addListaFoto, removeListaFoto }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
