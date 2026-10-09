// Utilidad de navegador (sin dependencias de servidor).

// Reduce la foto en el navegador (lado mayor 2000 px, JPEG) para subir rápido
// y no superar el límite de tamaño de Vercel.
export async function reducirFoto(archivo: File, ladoMax = 2000, calidad = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.'));
      i.src = url;
    });
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', calidad)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

