import CartIcon from '@/components/CartIcon';
import CuentaMenu from '@/components/CuentaMenu';

export default function HeaderBar({
  nombre,
  rol,
  mostrarCarrito,
}: {
  nombre: string;
  rol: string;
  mostrarCarrito: boolean;
}) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-end gap-3 px-6 py-3 border-b border-borde bg-white">
      {mostrarCarrito && <CartIcon />}
      <CuentaMenu nombre={nombre} rol={rol} />
    </div>
  );
}
