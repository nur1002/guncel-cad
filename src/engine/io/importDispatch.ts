// Dosya içe aktarma dispatcher'ı: uzantıya göre doğru işleyiciye yönlendirir.
// DWG, DXF, GeoJSON, PDF, PNG, JPG formatlarını doğrudan destekler.

import { isImageFile, isPdfFile, loadImageFile, loadPdfFirstPageAsImage } from "./fileImport";
import {
  parseDxfFile,
  parseGeoJsonFile,
  isDxfFile,
  isGeoJsonFile,
  type VectorImportResult,
  type VectorTraceImportResult,
} from "./dxfImport";
import { parseDwgFile } from "./dwgImport";
import { useStore } from "../core/store";
import * as M from "../core/mutations";

const DEFAULT_IMAGE_WIDTH_CM = 1000;

export function isDwgFile(file: File): boolean {
  return /\.dwg$/i.test(file.name);
}

/** Dürüst bir özet: kaç oda tanındı, kaç bağlantısız/kapanmayan segment atlandı (§ "sadece odaları tanısın"). */
function vectorImportToast(result: VectorImportResult): string {
  const parts = [`${result.roomCount} oda tanındı (${result.wallCount} duvar)`];
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} bağlantısız/kapanmayan segment atlandı (duvar olarak eklenmedi)`);
  }
  return parts.join(", ") + ".";
}

/** DXF/DWG kroki içe aktarımı: hiçbir otomatik tanıma yapılmaz, dosya olduğu gibi eklenir. */
function traceImportToast(result: VectorTraceImportResult): string {
  return (
    `Kroki eklendi: ${result.segmentCount} çizgi. Hiçbir otomatik duvar/oda ataması yapılmadı — ` +
    `parsel merkezine yerleştirildi, sürükleyip döndürebilir, sonra "Parsele Yerleştir" ile onaylayabilirsiniz. ` +
    result.scaleNote
  );
}

/**
 * Dosyayı türüne göre projeye uygular.
 */
export async function handleImportFile(file: File): Promise<boolean> {
  const store = useStore.getState();

  // ── Görsel / PDF (Arka Plan İzleme Görseli) ──
  if (isImageFile(file) || isPdfFile(file)) {
    const loaded = isPdfFile(file) ? await loadPdfFirstPageAsImage(file) : await loadImageFile(file);
    const aspect = loaded.heightPx / loaded.widthPx;
    const widthCm = DEFAULT_IMAGE_WIDTH_CM;
    const heightCm = widthCm * aspect;
    store.updateVariant((v) =>
      M.setBackgroundImage(v, {
        dataUrl: loaded.dataUrl,
        xCm: 0,
        yCm: 0,
        widthCm,
        heightCm,
        opacity: 0.6,
        locked: false,
      })
    );
    store.fitToScreen();
    store.pushToast("Görsel / PDF kat planı arka plan olarak eklendi.", "basari");
    return true;
  }

  // ── GeoJSON Vektör ──
  if (isGeoJsonFile(file)) {
    const result = await parseGeoJsonFile(file);
    store.updateVariant((v) => result.apply(v));
    store.fitToScreen();
    store.pushToast(vectorImportToast(result), "basari");
    return true;
  }

  // ── DXF (kroki — otomatik duvar/oda ataması yapılmaz) ──
  if (isDxfFile(file)) {
    const result = await parseDxfFile(file);
    const parsel = store.parsel;
    store.updateVariant((v) => M.updateVectorTrace(result.apply(v), { x: parsel.widthCm / 2, y: parsel.lengthCm / 2 }));
    store.fitToScreen();
    store.pushToast(traceImportToast(result), "basari");
    return true;
  }

  // ── DWG (AutoCAD İkili Format) ──
  if (isDwgFile(file)) {
    const result = await parseDwgFile(file);

    if (!result.success) {
      // Bloke edici alert() yerine sessiz bir bilgi notu: format değiştirmeye
      // zorlayan bir talimat verilmez, kullanıcı isterse başka bir dosya dener.
      store.pushToast(result.message, "uyari");
      return false;
    }

    const parsel = store.parsel;
    store.updateVariant((v) => {
      let vv = result.apply(v);
      // "Bounding box → parsel merkezine yerleştir" — yalnızca gerçek kroki (vector)
      // sonuçları için anlamlı; raster önizleme zaten kendi konumuyla ekleniyor.
      if (result.kind === "vector") vv = M.updateVectorTrace(vv, { x: parsel.widthCm / 2, y: parsel.lengthCm / 2 });
      return vv;
    });
    store.fitToScreen();
    const toastMsg =
      result.kind === "vector"
        ? `${result.message} (${result.segmentCount} çizgi.) Parsel merkezine yerleştirildi, sürükleyip döndürebilir, sonra "Parsele Yerleştir" ile onaylayabilirsiniz.`
        : result.message;
    store.pushToast(toastMsg, result.kind === "vector" && result.segmentCount === 0 ? "uyari" : "basari");
    return true;
  }

  // ── Desteklenmeyen Format ──
  window.alert(
    "Desteklenmeyen dosya türü.\n\n" +
    "Desteklenen formatlar: DWG, DXF, GeoJSON, PDF, PNG, JPG\n\n" +
    "DWG dosyalarından veri çıkarılamıyorsa, AutoCAD'de DXF olarak kaydedip yükleyebilirsiniz."
  );
  return false;
}
