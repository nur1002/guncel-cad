// Dosya içe aktarma dispatcher'ı: uzantıya göre doğru işleyiciye yönlendirir.
// DWG, DXF, GeoJSON, PDF, PNG, JPG formatlarını doğrudan destekler.

import { isImageFile, isPdfFile, loadImageFile, loadPdfFirstPageAsImage } from "./fileImport";
import { parseDxfFile, parseGeoJsonFile, isDxfFile, isGeoJsonFile } from "./vectorImport";
import { parseDwgFile } from "./dwgImport";
import { useStore } from "./store";
import * as M from "./mutations";

const DEFAULT_IMAGE_WIDTH_CM = 1000;

export function isDwgFile(file: File): boolean {
  return /\.dwg$/i.test(file.name);
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
    store.pushToast(`GeoJSON içe aktarıldı: ${result.wallCount} duvar.`, "basari");
    return true;
  }

  // ── DXF Vektör ──
  if (isDxfFile(file)) {
    const result = await parseDxfFile(file);
    store.updateVariant((v) => result.apply(v));
    store.fitToScreen();
    store.pushToast(`DXF içe aktarıldı: ${result.wallCount} duvar.`, "basari");
    return true;
  }

  // ── DWG (AutoCAD İkili Format) ──
  if (isDwgFile(file)) {
    const result = await parseDwgFile(file);

    // `result.success`, apply() çalışmadan ÖNCE bilinen bir düz alan (getter değil) —
    // "veri gerçekten bulundu mu" kararını buna göre veriyoruz. `wallCount` ise
    // apply() içindeki bir sayaca bağlı bir getter olduğu için apply() çalışmadan
    // önce her zaman 0 döner; onu gate olarak kullanmak (önceki hata) apply()'ın
    // hiç çağrılmamasına — yani "başarılı" mesajına rağmen hiçbir şeyin tuvale
    // yansımamasına— yol açıyordu.
    if (!result.success) {
      window.alert(result.message);
      return false;
    }

    store.updateVariant((v) => result.apply(v));
    store.fitToScreen();
    // apply() artık çalıştı; wallCount getter'ı doğru (son) değeri veriyor.
    const toastMsg = result.kind === "vector" ? `${result.message} (${result.wallCount} duvar oluşturuldu.)` : result.message;
    store.pushToast(toastMsg, result.kind === "vector" && result.wallCount === 0 ? "uyari" : "basari");
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
