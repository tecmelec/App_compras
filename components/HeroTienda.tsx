export default function HeroTienda() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-marcaClaro mb-6">
      <div className="relative z-10 px-8 py-10 max-w-lg">
        <p className="flex items-center gap-2 text-marca font-medium text-sm mb-2">
          <span className="w-6 h-px bg-marca inline-block" />
          Tienda Tecmelec
        </p>
        <h1 className="text-3xl font-bold text-grafito leading-tight">
          Tus solicitudes de material,
          <br />a solo un click
        </h1>
      </div>

      {/* Composición geométrica decorativa (sin fotografías) */}
      <svg
        className="absolute inset-y-0 right-0 h-full w-1/2 max-w-md"
        viewBox="0 0 400 220"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <polygon points="120,0 400,0 400,220 40,220" fill="#178A4C" opacity="0.08" />
        <polygon points="220,0 400,0 400,220 160,220" fill="#178A4C" opacity="0.14" />
        <polygon points="320,0 400,0 400,220 300,220" fill="#0B3B26" opacity="0.9" />
        {/* líneas tipo circuito */}
        <g stroke="#178A4C" strokeWidth="2" opacity="0.5" fill="none">
          <path d="M180 40 h60 v30 h40" />
          <circle cx="180" cy="40" r="4" fill="#178A4C" />
          <circle cx="280" cy="70" r="4" fill="#178A4C" />
          <path d="M200 140 h50 v-25 h35" />
          <circle cx="200" cy="140" r="4" fill="#178A4C" />
          <circle cx="285" cy="115" r="4" fill="#178A4C" />
          <path d="M230 180 h70" />
          <circle cx="230" cy="180" r="4" fill="#178A4C" />
          <circle cx="300" cy="180" r="4" fill="#178A4C" />
        </g>
      </svg>
    </div>
  );
}
