'use client';

import { useState } from 'react';

// Botón "Exportar a Excel" reutilizable para cualquier tabla de la app.
// Exporta exactamente las filas que recibe (normalmente las ya filtradas que
// ve el usuario). La librería exceljs se carga solo al pulsar, para no
// engordar la carga normal de la página.

export type ColumnaExcel<T> = {
  titulo: string;
  valor: (fila: T) => string | number | boolean | Date | null | undefined;
  ancho?: number; // en caracteres aprox.
  formato?: 'texto' | 'numero' | 'moneda' | 'precio' | 'fecha';
};

function aFecha(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== 'string' || !v) return null;
  // 'AAAA-MM-DD' (fecha sin hora) -> mediodía local, para que no cambie de día por la zona horaria
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const d = new Date(soloFecha ? `${v}T12:00:00` : v);
  return isNaN(d.getTime()) ? null : d;
}

export default function ExportarExcelBoton<T>({
  filas,
  columnas,
  nombreArchivo,
  nombreHoja = 'Datos',
  className = '',
}: {
  filas: T[];
  columnas: ColumnaExcel<T>[];
  nombreArchivo: string; // sin extensión; se añade la fecha
  nombreHoja?: string;
  className?: string;
}) {
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    setExportando(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const libro = new ExcelJS.Workbook();
      libro.creator = 'Tienda Tecmelec';
      libro.created = new Date();
      const hoja = libro.addWorksheet(nombreHoja.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      hoja.columns = columnas.map((c) => ({
        header: c.titulo,
        width: c.ancho ?? Math.max(12, Math.min(45, c.titulo.length + 4)),
        style:
          c.formato === 'moneda'
            ? { numFmt: '#,##0.00 "€"' }
            : c.formato === 'precio'
              ? { numFmt: '#,##0.00### "€"' }
            : c.formato === 'fecha'
              ? { numFmt: 'dd/mm/yyyy' }
              : c.formato === 'numero'
                ? { numFmt: '#,##0.##' }
                : {},
      }));

      for (const fila of filas) {
        hoja.addRow(
          columnas.map((c) => {
            const v = c.valor(fila);
            if (v === null || v === undefined || v === '') return null;
            if (c.formato === 'fecha') return aFecha(v) ?? String(v);
            if (c.formato === 'numero' || c.formato === 'moneda' || c.formato === 'precio') {
              const n = typeof v === 'number' ? v : Number(v);
              return Number.isFinite(n) ? n : String(v);
            }
            if (typeof v === 'boolean') return v ? 'Sí' : 'No';
            return v as string | number | Date;
          })
        );
      }

      // Cabecera con el verde de la app, en blanco y negrita, y filtros activados.
      const cabecera = hoja.getRow(1);
      cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF178A4C' } };
      cabecera.alignment = { vertical: 'middle' };
      cabecera.height = 20;
      hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

      const buffer = await libro.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nombreArchivo}_${fecha}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('No se pudo exportar a Excel:', e);
      alert('No se pudo generar el Excel. Inténtalo de nuevo.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={exportando || filas.length === 0}
      title={filas.length === 0 ? 'No hay filas para exportar' : `Exportar ${filas.length} filas a Excel`}
      className={`inline-flex items-center gap-2 bg-white border border-marca text-marca rounded-lg px-4 py-2 text-sm font-medium hover:bg-marcaClaro disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${className}`}
    >
      {/* Icono de hoja de cálculo (genérico, sin logotipo de marca) */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2.5" fill="#178A4C" />
        <path d="M8.5 8l7 8M15.5 8l-7 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {exportando ? 'Generando…' : 'Exportar a Excel'}
    </button>
  );
}
