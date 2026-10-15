// Documentos adjuntos a una solicitud (ver migración 20261019120000_solicitud_documentos.sql).
export const BUCKET_DOCUMENTOS = 'documentos-solicitud';
export const MAX_DOCUMENTO_BYTES = 25 * 1024 * 1024;
export const EXTENSIONES_DOCUMENTO = [
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic',
  'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx',
  'dwg', 'dxf', 'zip', 'eml', 'msg',
];

export function extensionDe(nombre: string): string {
  const i = nombre.lastIndexOf('.');
  return i >= 0 ? nombre.slice(i + 1).toLowerCase() : '';
}

export function tamanoLegible(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}
