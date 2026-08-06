// DWG İçe Aktarıcı
//
// DWG, AutoCAD'in kapalı kaynak, sıkıştırılmış ikili (binary) formatıdır. Gerçek
// çözümleme için tarihsel olarak ya Autodesk'in kendi (ücretli/lisanslı) SDK'sı ya
// da ters mühendislikle yazılmış açık kaynak LibreDWG projesi kullanılır.
//
// Bu modül önce GERÇEK bir ayrıştırıcı kullanır: `@mlightcad/libredwg-web` paketi,
// LibreDWG'nin WebAssembly'e derlenmiş halidir (GPL-3.0 — bkz. proje notları). DWG
// dosyasını gerçekten çözüp DXF'e çevirir; sonuç, projede zaten var olan ve test
// edilmiş DXF ayrıştırıcısına (`parseDxfFile`) verilir.
//
// ÖNEMLİ TASARIM KARARI: WASM dönüşümü başarısız olursa (bozuk dosya, desteklenmeyen
// çok eski/yeni bir DWG sürümü vb.) bu modül dosyanın ham baytlarını "koordinat gibi
// görünen" sayı dizileri için TARAMAZ. Sıkıştırılmış bir ikili akışı rastgele float64
// çiftleri olarak yorumlamak matematiksel olarak anlamsız gürültü üretir — gerçek bir
// mimari plan gibi GÖRÜNSE bile hiçbir gerçek köşe/duvara karşılık gelmez (bu, WASM
// entegrasyonundan önce yaşanan gerçek bir hataydı: kullanıcı gerçek bir ev planı
// yükledi, sonuç rastgele çizgilerden oluşan bir "yıldız patlaması" oldu). Belediye
// kullanımında yanlış ama gerçekmiş gibi görünen bir kroki, boş bir hata mesajından
// çok daha kötüdür. Bu yüzden WASM dönüşümü başarısız olursa sırasıyla:
//  1) Gömülü DXF metin bloğu — bazı DWG varyantları/araçları dosya içinde ham ASCII
//     DXF varlık verisi bırakır; bulunursa gerçek koordinatlardır (tahmin değildir).
//  2) Gömülü BMP/PNG önizleme küçük resmi — çoğu CAD programı dosya gezgini önizlemesi
//     için DWG başlığına gerçek bir küçük resim gömer; bulunursa GERÇEK bir görsel
//     referans olarak arka plana eklenir (üzerinden elle çizilebilir).
//  3) Hiçbiri yoksa: dürüstçe "veri çıkarılamadı" denir ve DXF/PDF'e çevirme önerilir.

import type { FloorVariantData } from "../data/model";
import * as M from "./mutations";
import { type Pt } from "./geometry";
import { parseDxfFile } from "./vectorImport";

/** LibreDWG WASM modülünün .wasm ikili dosyasını bulacağı klasör (bkz. public/wasm/). */
const LIBREDWG_WASM_DIR = "/wasm";

export interface DwgImportResult {
  kind: "vector" | "raster" | "none";
  apply: (variant: FloorVariantData) => FloorVariantData;
  wallCount: number;
  message: string;
  /**
   * `apply()` çağrılmadan ÖNCE bilinen, veri gerçekten bulundu mu bilgisi. `wallCount`
   * bir getter olduğu için (gerçek sayı yalnızca `apply()` çalıştıktan SONRA doğru
   * değeri verir) çağıran taraf "uygulamaya değer mi" kararını bunun yerine bu alanla
   * vermeli.
   */
  success: boolean;
}

function readHeader(bytes: Uint8Array): string {
  try {
    const h = String.fromCharCode(...bytes.slice(0, 6));
    if (h.startsWith("AC")) return h;
  } catch {
    /* ignore */
  }
  return "UNKNOWN";
}

/**
 * Gerçek DWG çözümlemesi: LibreDWG WASM ile dosyayı DXF'e çevirir, sonucu projede
 * zaten var olan `parseDxfFile` ile işler. Ağır (~10 MB) WASM modülü sadece bir DWG
 * seçildiğinde, dinamik import ile yüklenir — ana paket boyutunu etkilemez.
 * Herhangi bir adımda başarısız olursa `null` döner (çağıran taraf geri dönüş
 * yöntemlerine geçer) — asla tahmini/uydurma veri üretmez.
 */
async function tryRealDwgConversion(file: File, headerStr: string): Promise<DwgImportResult | null> {
  try {
    const { LibreDwg } = await import("@mlightcad/libredwg-web");
    const libredwg = await LibreDwg.create(LIBREDWG_WASM_DIR);
    const buffer = await file.arrayBuffer();
    const dxfBytes = libredwg.dwg_write_dxf(buffer);
    if (!dxfBytes || dxfBytes.length === 0) return null;

    const dxfText = new TextDecoder("utf-8", { fatal: false }).decode(dxfBytes);
    const dxfFile = new File([dxfText], file.name.replace(/\.dwg$/i, ".dxf"), { type: "text/plain" });
    // parseDxfFile, hiç varlık bulamazsa hata fırlatır — bu durumda da geri dönüş
    // yöntemlerine geçilecek (aşağıdaki catch bloğu yakalar).
    const vectorResult = await parseDxfFile(dxfFile);

    return {
      kind: "vector",
      apply: vectorResult.apply,
      get wallCount() {
        return vectorResult.wallCount;
      },
      success: true,
      message:
        `DWG dosyası (${file.name} — ${headerStr}) LibreDWG ile GERÇEK vektör verisine dönüştürülüp ` +
        `içe aktarıldı. ${vectorResult.scaleNote}`,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("LibreDWG WASM dönüşümü başarısız oldu, geri dönüş yöntemlerine geçiliyor:", err);
    return null;
  }
}

/**
 * DWG dosyasını önce gerçek bir ayrıştırıcıyla (LibreDWG WASM) işler; bu başarısız
 * olursa yalnızca kanıtlanabilir gerçek veriyi çıkaran geri dönüş yöntemlerine
 * geçer. Hiçbir aşamada uydurma/tahmini geometri üretmez.
 */
export async function parseDwgFile(file: File): Promise<DwgImportResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const headerStr = readHeader(bytes);

  // ── Yöntem 0: Gerçek Ayrıştırma (LibreDWG WASM) ──
  const realResult = await tryRealDwgConversion(file, headerStr);
  if (realResult) return realResult;

  // ── Yöntem 1: Gömülü DXF Metin Bloğu ──
  // Bazı DWG dosyaları (veya .dwg uzantılı ama aslında metin içeren dosyalar) içinde
  // ham DXF (ASCII) varlık bloğu barındırabilir. Bu, tahmin değil — gerçek DXF grup
  // kodu söz dizimiyle eşleşen GERÇEK koordinatlardır.
  const textDecoder = new TextDecoder("ascii", { fatal: false });
  const fullText = textDecoder.decode(bytes);
  const dxfLines: { p1: Pt; p2: Pt }[] = [];

  let searchFrom = 0;
  while (true) {
    const lineIdx = fullText.indexOf("LINE", searchFrom);
    if (lineIdx === -1) break;
    searchFrom = lineIdx + 4;

    const chunk = fullText.substring(lineIdx, lineIdx + 500);
    const x10 = extractGroupCode(chunk, "10");
    const y20 = extractGroupCode(chunk, "20");
    const x11 = extractGroupCode(chunk, "11");
    const y21 = extractGroupCode(chunk, "21");

    if (x10 !== null && y20 !== null && x11 !== null && y21 !== null) {
      const len = Math.hypot(x11 - x10, y21 - y20);
      if (len >= 5 && len <= 50000) {
        dxfLines.push({ p1: { x: x10, y: y20 }, p2: { x: x11, y: y21 } });
      }
    }
  }

  if (dxfLines.length >= 3) {
    return buildFromSegments(dxfLines, file.name, headerStr);
  }

  // ── Yöntem 2: Gömülü BMP/PNG Önizleme Görseli ──
  // Çoğu CAD programı, dosya gezgini/gezinme paneli önizlemesi için DWG başlığına
  // gerçek bir küçük resim (thumbnail) gömer. Bulunursa GERÇEK bir görsel referanstır.
  const dataView = new DataView(buffer);
  let imageDataUrl: string | null = null;

  for (let i = 13; i < Math.min(bytes.length - 54, 65536); i++) {
    if (bytes[i] === 0x42 && bytes[i + 1] === 0x4d) {
      const fileSize = dataView.getUint32(i + 2, true);
      if (fileSize > 500 && fileSize < 5000000 && i + fileSize <= bytes.length) {
        const imgBytes = bytes.slice(i, i + fileSize);
        imageDataUrl = await blobToDataUrl(new Blob([imgBytes], { type: "image/bmp" }));
        break;
      }
    }
  }

  if (!imageDataUrl) {
    for (let i = 0; i < Math.min(bytes.length - 8, 65536); i++) {
      if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x47) {
        let endIdx = bytes.length;
        for (let j = i + 8; j < bytes.length - 8; j++) {
          if (bytes[j] === 0x49 && bytes[j + 1] === 0x45 && bytes[j + 2] === 0x4e && bytes[j + 3] === 0x44) {
            endIdx = j + 8;
            break;
          }
        }
        const imgBytes = bytes.slice(i, endIdx);
        imageDataUrl = await blobToDataUrl(new Blob([imgBytes], { type: "image/png" }));
        break;
      }
    }
  }

  if (imageDataUrl) {
    const apply = (variant: FloorVariantData): FloorVariantData =>
      M.setBackgroundImage(variant, {
        dataUrl: imageDataUrl!,
        xCm: 0,
        yCm: 0,
        widthCm: 1000,
        heightCm: 650,
        opacity: 0.6,
        locked: false,
      });

    return {
      kind: "raster",
      apply,
      wallCount: 0,
      success: true,
      message:
        `DWG dosyasındaki (${headerStr}) gömülü küçük önizleme görseli arka plan olarak eklendi. ` +
        `Bu küçük/düşük çözünürlüklü bir önizlemedir — Sol panel → "Ayarlar" sekmesinden gerçek ` +
        `ölçeğe göre boyutlandırıp üzerinden elle çizebilirsiniz. Daha net bir görsel için dosyayı ` +
        `PDF/PNG olarak dışa aktarıp yüklemeniz önerilir.`,
    };
  }

  // ── Yöntem 3: Dürüst Son Çare ──
  // DWG'nin sıkıştırılmış ikili gövdesinden ne gerçek DXF metni ne de bir önizleme
  // görseli çıkarılabildi. Rastgele/tahmini geometri UYDURMAK yerine (bu, yanlış ama
  // gerçekmiş gibi görünen bir kroki üretir — belediye kullanımında bir hata mesajından
  // daha tehlikelidir) kullanıcıya net bir sonraki adım verilir.
  return {
    kind: "none",
    apply: (v) => v,
    wallCount: 0,
    success: false,
    message:
      `DWG dosyası (${file.name} — ${headerStr}) okundu ancak içinden ne gerçek çizim verisi ne de ` +
      `bir önizleme görseli çıkarılabildi (sıkıştırılmış ikili format, tarayıcıda tam çözümlenemiyor).\n\n` +
      `Rastgele/tahmini bir çizim oluşturmak yerine bilgilendiriyoruz — yanlış bir plan, boş bir ` +
      `ekrandan daha kötü olurdu.\n\n` +
      `Çözüm:\n` +
      `• AutoCAD, BricsCAD veya ücretsiz LibreCAD/DraftSight'ta dosyayı açıp "Farklı Kaydet → DXF" ` +
      `olarak kaydedin (aynı çizim, sadece format değişir) — DXF burada tam destekleniyor.\n` +
      `• Veya çizimi PDF/PNG/JPG olarak dışa aktarıp izleme görseli (arka plan) olarak yükleyin, ` +
      `üzerinden elle çizin.`,
  };
}

// ── Yardımcı Fonksiyonlar ──

function extractGroupCode(chunk: string, code: string): number | null {
  const patterns = [
    new RegExp(`\\n\\s*${code}\\s*\\n\\s*([\\-\\d\\.]+)`, "m"),
    new RegExp(`\\r\\n\\s*${code}\\s*\\r\\n\\s*([\\-\\d\\.]+)`, "m"),
  ];
  for (const re of patterns) {
    const m = chunk.match(re);
    if (m) {
      const val = parseFloat(m[1]);
      if (isFinite(val)) return val;
    }
  }
  return null;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/** Gömülü DXF metninden çıkan GERÇEK (tahmini olmayan) segmentlerden köşe/duvar üretir. */
function buildFromSegments(segments: { p1: Pt; p2: Pt }[], fileName: string, headerStr: string): DwgImportResult {
  const allX = segments.flatMap((s) => [s.p1.x, s.p2.x]);
  const allY = segments.flatMap((s) => [s.p1.y, s.p2.y]);
  const minX = Math.min(...allX);
  const minY = Math.min(...allY);
  const maxX = Math.max(...allX);
  const maxY = Math.max(...allY);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // DXF'te birim standart değildir; makul bir varsayımla cm'ye çevir (aynı belirsizlik
  // vectorImport.ts'teki DXF/GeoJSON içe aktarımında da var — kullanıcıya bildirilir).
  let scale = 1;
  if (spanX < 200 && spanY < 200) {
    scale = 100; // muhtemelen metre → cm
  } else if (spanX > 50000 || spanY > 50000) {
    scale = 0.1; // muhtemelen milimetre → cm
  }

  const segsToUse = segments.map((s) => ({
    p1: { x: Math.round((s.p1.x - minX) * scale), y: Math.round((s.p1.y - minY) * scale) },
    p2: { x: Math.round((s.p2.x - minX) * scale), y: Math.round((s.p2.y - minY) * scale) },
  }));

  let wallCount = 0;
  const apply = (variant: FloorVariantData): FloorVariantData => {
    let vv = variant;
    for (const seg of segsToUse) {
      let c1 = M.findNearestCorner(vv, seg.p1);
      if (!c1) {
        const [n1, id1] = M.addCorner(vv, seg.p1);
        vv = n1;
        c1 = id1;
      }
      let c2 = M.findNearestCorner(vv, seg.p2);
      if (!c2) {
        const [n2, id2] = M.addCorner(vv, seg.p2);
        vv = n2;
        c2 = id2;
      }
      if (c1 === c2) continue;
      const before = vv;
      vv = M.addWall(vv, c1, c2, 20);
      if (vv !== before) wallCount++;
    }
    return vv;
  };

  return {
    kind: "vector",
    apply,
    get wallCount() {
      return wallCount;
    },
    success: segsToUse.length > 0,
    message:
      `DWG dosyası (${fileName} — ${headerStr}) içindeki gömülü DXF metin bloğundan ${segsToUse.length} ` +
      `duvar segmenti bulundu ve tuvale yerleştirildi. Ölçek birimi dosyada standart olmadığından ` +
      `otomatik bir varsayım (×${scale}) uygulandı — ölçüleri kontrol edin.`,
  };
}
