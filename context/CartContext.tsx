'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type CartItem = {
  producto_id: string;
  nombre: string;
  imagen_url: string | null;
  cantidad: number;
};

type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'cantidad'>, cantidad: number) => void;
  updateCantidad: (producto_id: string, cantidad: number) => void;
  removeItem: (producto_id: string) => void;
  clear: () => void;
  totalItems: number;
};

const CartContext = createContext<CartContextType | null>(null);

function storageKey(userId: string) {
  return `tecmelec_carrito_${userId}`;
}

export function CartProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
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
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(items));
    }
  }, [items, loaded, userId]);

  function addItem(item: Omit<CartItem, 'cantidad'>, cantidad: number) {
    setItems((prev) => {
      const existing = prev.find((i) => i.producto_id === item.producto_id);
      if (existing) {
        return prev.map((i) =>
          i.producto_id === item.producto_id ? { ...i, cantidad: i.cantidad + cantidad } : i
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
  }

  const totalItems = items.reduce((sum, i) => sum + i.cantidad, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateCantidad, removeItem, clear, totalItems }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
