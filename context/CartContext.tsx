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
const STORAGE_KEY = 'tecmelec_carrito';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setItems(JSON.parse(raw));
      } catch {
        // carrito corrupto, se ignora
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, loaded]);

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
