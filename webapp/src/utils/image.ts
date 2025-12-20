export async function compressImage(file: File, opts?: { maxSide?: number; quality?: number; cropTallToSquare?: boolean }) {
  if (!file.type.startsWith("image/")) return file;
  const maxSide = opts?.maxSide ?? 1280;
  const quality = opts?.quality ?? 0.82;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read error"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("load error"));
    image.src = dataUrl;
  });

  const { width, height } = img;
  if (!width || !height) return file;
  const cropTall = Boolean(opts?.cropTallToSquare) && height > width;
  const srcW = cropTall ? width : width;
  const srcH = cropTall ? width : height;
  const srcX = 0;
  const srcY = cropTall ? Math.round((height - width) / 2) : 0;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const targetW = Math.round(srcW * scale);
  const targetH = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
