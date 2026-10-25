/** Convert ordinary JPEG/PNG uploads to WebP at quality 85 in the browser. */
export async function optimizeImageForUpload(file: File): Promise<File> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0);

    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!webp || webp.size >= file.size) return file;

    const baseName = file.name.replace(/\.(jpe?g|png)$/i, '');
    return new File([webp], `${baseName || 'image'}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
