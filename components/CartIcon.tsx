'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';

export default function CartIcon() {
  const { totalItems } = useCart();

  return (
    <Link
      href="/carrito"
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-fondo transition-colors"
      aria-label="Carrito"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1C2126"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>

      {totalItems > 0 && (
        <span className="absolute -top-1 -right-1 bg-rojo text-white text-xs font-semibold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center border-2 border-white">
          {totalItems}
        </span>
      )}
    </Link>
  );
}
