// Dosya içe aktarma yardımcıları: taranmış kroki (jpg/png/pdf) izleme görseline
// dönüştürme. GeoJSON/DXF vektör içe aktarma için bkz. vectorImport.ts.

export interface LoadedRasterImage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

export function loadImageFile(file: File): Promise<LoadedRasterImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => resolve({ dataUrl, widthPx: img.naturalWidth, heightPx: img.naturalHeight });
      img.onerror = () => reject(new Error("Görsel yüklenemedi"));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

let pdfjsLibPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then(async (lib) => {
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    });
  }
  return pdfjsLibPromise;
}

/** PDF'in ilk sayfasını rastere çevirir (izleme arka planı olarak kullanılır). */
export async function loadPdfFirstPageAsImage(file: File, scale = 2): Promise<LoadedRasterImage> {
  const pdfjsLib = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas bağlamı oluşturulamadı");

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { dataUrl: canvas.toDataURL("image/png"), widthPx: canvas.width, heightPx: canvas.height };
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}
