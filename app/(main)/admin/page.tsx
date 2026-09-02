import Link from 'next/link';

const secciones = [
  { href: '/admin/usuarios', titulo: 'Usuarios', desc: 'Crear cuentas, asignar rol, comprador y responsable.' },
  { href: '/admin/productos', titulo: 'Productos', desc: 'Gestionar el catálogo de la Tienda Tecmelec.' },
  { href: '/admin/estados', titulo: 'Estados de pedido', desc: 'Definir los estados por los que pasa una solicitud.' },
];

export default function AdminHomePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Administración</h1>
      <p className="text-slate text-sm mb-6">Gestión de la plataforma.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
        {secciones.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="bg-white border border-borde rounded-lg p-5 hover:border-acero transition-colors"
          >
            <h2 className="font-medium text-grafito mb-1">{s.titulo}</h2>
            <p className="text-sm text-slate">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
