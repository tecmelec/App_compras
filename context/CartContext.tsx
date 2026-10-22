'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { descartarListaFoto } from '@/app/actions/lista-foto';
import { descartarDocumento } from '@/app/actions/documentos-solicitud';

export type CartItem = {
  producto_id: string;
  nombre: string;
  imagen_url: string | null;
  cantidad: number;
  multiplo_compra?: number | null;
  unidad_medida?: string | null;
  // Añadido con "Crear desde artículos de BC": la solicitud requiere aprobación siempre.
  desde_bc?: boolean;
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
  // Documentos adjuntos (ya subidos) que acompañarán a la solicitud
  documentos: string[];
  addDocumento: (id: string) => void;
  removeDocumento: (id: string) => void;
  // Comentarios u observaciones para el comprador
  comentarios: string;
  setComentarios: (texto: string) => void;
  rol: string | null;
};

const CartContext = createContext<CartContextType | null>(null);

function storageKey(userId: string) {
  return `tecmelec_carrito_${userId}`;
}

function storageKeyListas(userId: string) {
  return `tecmelec_carrito_listas_foto_${userId}`;
}

function storageKeyDocumentos(userId: string) {
  return `tecmelec_carrito_documentos_${userId}`;
}

function storageKeyComentarios(userId: string) {
  return `tecmelec_carrito_comentarios_${userId}`;
}

export function CartProvider({
  userId,
  rol = null,
  children,
}: {
  userId: string;
  rol?: string | null;
  children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [listasFoto, setListasFoto] = useState<string[]>([]);
  const [documentos, setDocumentos] = useState<string[]>([]);
  const [comentarios, setComentarios] = useState('');
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
    try {
      const rawDocs = window.localStorage.getItem(storageKeyDocumentos(userId));
      setDocumentos(rawDocs ? JSON.parse(rawDocs) : []);
    } catch {
      setDocumentos([]);
    }
    try {
      setComentarios(window.localStorage.getItem(storageKeyComentarios(userId)) || '');
    } catch {
      setComentarios('');
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(items));
      window.localStorage.setItem(storageKeyListas(userId), JSON.stringify(listasFoto));
      window.localStorage.setItem(storageKeyDocumentos(userId), JSON.stringify(documentos));
      window.localStorage.setItem(storageKeyComentarios(userId), comentarios);
    }
  }, [items, listasFoto, documentos, comentarios, loaded, userId]);

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
    setDocumentos([]);
    setComentarios('');
  }

  function addDocumento(id: string) {
    setDocumentos((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  // Quita el documento del carrito y lo borra (si aún no se ha enviado en una solicitud).
  function removeDocumento(id: string) {
    setDocumentos((prev) => prev.filter((x) => x !== id));
    descartarDocumento(id).catch(() => {});
  }

  function addListaFoto(id: string) {
    setListasFoto((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  // Quita la foto del carrito y la borra (si aún no se ha enviado en una solicitud).
  function removeListaFoto(id: string) {
    setListasFoto((prev) => prev.filter((x) => x !== id));
    descartarListaFoto(id).catch(() => {});
  }

  // (Un carrito sin artículos pero con una lista de materiales es válido: se puede
  // enviar la solicitud solo con la lista. La lista se quita a mano desde el carrito.)

  // Nº de artículos distintos en el carrito (no la suma de unidades)
  const totalItems = items.length;

  return (
    <CartContext.Provider value={{ items, addItem, updateCantidad, removeItem, clear, totalItems, listasFoto, addListaFoto, removeListaFoto, documentos, addDocumento, removeDocumento, comentarios, setComentarios, rol }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
