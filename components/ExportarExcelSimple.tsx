'use client';

import ExportarExcelBoton from '@/components/ExportarExcelBoton';

// Variante para páginas que se generan en el servidor: recibe los datos ya
// como tabla (cabeceras + filas de valores simples), que sí se pueden pasar
// del servidor al navegador.
export default function ExportarExcelSimple({
  cabeceras,
  filas,
  nombreArchivo,
  nombreHoja,
  className,
}: {
  cabeceras: { titulo: string; ancho?: number; formato?: 'texto' | 'numero' | 'moneda' | 'fecha' }[];
  filas: (string | number | null)[][];
  nombreArchivo: string;
  nombreHoja?: string;
  className?: string;
}) {
  return (
    <ExportarExcelBoton
      filas={filas}
      nombreArchivo={nombreArchivo}
      nombreHoja={nombreHoja}
      className={className}
      columnas={cabeceras.map((c, i) => ({ ...c, valor: (fila: (string | number | null)[]) => fila[i] }))}
    />
  );
}
