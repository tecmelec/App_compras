import Image from 'next/image';

export default function HeroTienda() {
  return (
    <div className="relative overflow-hidden rounded-xl mb-6">
      <Image
        src="/hero-tienda.png"
        alt="Tienda Tecmelec — Tus solicitudes de material a solo un click"
        width={2172}
        height={724}
        priority
        className="w-full h-auto"
      />
    </div>
  );
}
