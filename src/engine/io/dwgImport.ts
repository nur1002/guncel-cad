// DWG İçe Aktarıcı
//
// DWG, AutoCAD'in kapalı kaynak, sıkıştırılmış ikili (binary) formatıdır. Gerçek
// çözümleme için tarihsel olarak ya Autodesk'in kendi (ücretli/lisanslı) SDK'sı ya
// da ters mühendislikle yazılmış açık kaynak LibreDWG projesi kullanılır.
//
// Bu modül önce GERÇEK bir ayrıştırıcı kullanır: `@mlightcad/libredwg-web` paketi,
// LibreDWG'nin WebAssembly'e derlenmiş halidir (GPL-3.0 — bkz. proje notları). DWG
// dosyasını gerçekten çözüp DXF'e çevirir; bu dönüşüm (WASM + ağır ayrıştırma) bir
// Web Worker'da (`dwgConvertWorker.ts`) çalışır çünkü senkron WASM çağrısı ana
// thread'i kilitleyip sayfayı "yanıt vermiyor" durumuna düşürüyordu.
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

import type { FloorVariantData } from "../../data/model";
import * as M from "../core/mutations";
import type { Pt } from "../drawing/geometry";
import { applyTraceSegments } from "./dxfImport";
import type { TraceSegment } from "./vectorGraph";
import type { DwgWorkerRequest, DwgWorkerResponse } from "./dwgConvertWorker";

/** LibreDWG WASM modülünün .wasm ikili dosyasını bulacağı klasör (bkz. public/wasm/). */
const LIBREDWG_WASM_DIR = "/wasm";

export interface DwgImportResult {
  kind: "vector" | "raster" | "none";
  apply: (variant: FloorVariantData) => FloorVariantData;
  segmentCount: number;
  message: string;
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
 * `libredwg.dwg_write_dxf()` SENKRON bir WASM çağrısıdır — büyük/karmaşık gerçek
 * DWG dosyalarında saniyeler sürebilir ve bu süre boyunca çağrıldığı thread'i
 * tamamen kilitler (event loop'a geri dönemez). Ana thread'de çağrılırsa tarayıcı
 * "Sayfa Yanıt Vermiyor" gösterir — kullanıcının bildirdiği donma tam olarak buydu.
 * Bu yüzden TÜM dönüşüm (WASM + ağır DXF ayrıştırma/grafik filtreleme) bir Web
 * Worker'da (`dwgConvertWorker.ts`) çalıştırılır; kilitlenen sadece o arka plan
 * thread'i olur, sayfa/UI tamamen duyarlı kalır.
 */
function runDwgConvertWorker(buffer: ArrayBuffer, wasmDir: string): Promise<DwgWorkerResponse> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./dwgConvertWorker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      reject(err);
      return;
    }

    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error("LibreDWG dönüşümü zaman aşımına uğradı (90 saniye)"));
    }, 90000);

    worker.onmessage = (e: MessageEvent<DwgWorkerResponse>) => {
      clearTimeout(timeoutId);
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      clearTimeout(timeoutId);
      reject(e.error ?? new Error(e.message || "DWG worker hatası"));
      worker.terminate();
    };
    const req: DwgWorkerRequest = { buffer, wasmDir };
    worker.postMessage(req, [buffer]);
  });
}

/**
 * Gerçek DWG çözümlemesi: LibreDWG WASM ile dosyayı DXF'e çevirir (Worker içinde,
 * bkz. yukarısı), sonucu doğrudan `vectorTrace` katmanına yazar — Wall/Corner/Room
 * ÜRETMEZ (§ "otomatik tanıma yapmasın, dosyayı olduğu gibi açsın"). Ağır (~10 MB)
 * WASM modülü sadece bir DWG seçildiğinde, dinamik import ile yüklenir — ana paket
 * boyutunu etkilemez. Herhangi bir aşamada başarısız olursa `null` döner (çağıran
 * taraf geri dönüş yöntemlerine geçer) — asla tahmini/uydurma veri üretmez.
 */
async function tryRealDwgConversion(file: File, headerStr: string): Promise<DwgImportResult | null> {
  try {
    const buffer = await file.arrayBuffer();
    const response = await runDwgConvertWorker(buffer, LIBREDWG_WASM_DIR);
    if (!response.ok) return null;

    return {
      kind: "vector",
      apply: (variant) => applyTraceSegments(variant, response.segments, response.debugInfo),
      segmentCount: response.segments.length,
      success: true,
      message:
        `DWG dosyası (${file.name} — ${headerStr}) LibreDWG ile GERÇEK vektör verisine dönüştürülüp ` +
        `kroki olarak eklendi (hiçbir otomatik duvar/oda ataması yapılmadı). ${response.scaleNote}`,
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
  let attempts = 0;
  // Sıkıştırılmış ikili gürültüde sonsuz döngü ve donmayı engellemek için taramayı 1000 deneme ile sınırlıyoruz
  while (attempts < 1000) {
    const lineIdx = fullText.indexOf("LINE", searchFrom);
    if (lineIdx === -1) break;
    searchFrom = lineIdx + 4;
    attempts++;

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
        // En fazla 500 KB'lık bir thumbnail arıyoruz, tüm dosyayı tarayıp sayfayı dondurmasını engelliyoruz
        let endIdx = Math.min(bytes.length, i + 500000);
        let foundEnd = false;
        for (let j = i + 8; j < endIdx - 8; j++) {
          if (bytes[j] === 0x49 && bytes[j + 1] === 0x45 && bytes[j + 2] === 0x4e && bytes[j + 3] === 0x44) {
            endIdx = j + 8;
            foundEnd = true;
            break;
          }
        }
        if (foundEnd) {
          const imgBytes = bytes.slice(i, endIdx);
          imageDataUrl = await blobToDataUrl(new Blob([imgBytes], { type: "image/png" }));
          break;
        }
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
      segmentCount: 0,
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
    segmentCount: 0,
    success: false,
    message:
      `DWG dosyası (${file.name} — ${headerStr}) okundu ancak içinden gerçek çizim verisi çıkarılamadı ` +
      `(sıkıştırılmış ikili format, tarayıcıda tam çözümlenemedi). Rastgele/tahmini bir çizim oluşturmuyoruz ` +
      `— yanlış bir plan, boş bir ekrandan daha kötü olurdu.`,
  };
}

// ── Yardımcı Fonksiyonlar ──

// Regex nesnelerini döngü dışında önceden derleyerek performans kaybını önlüyoruz
const GROUP_CODE_PATTERNS: Record<string, RegExp[]> = {
  "10": [/[\r\n]\s*10\s*[\r\n]\s*([\-\d\.]+)/, /[\r\n]\s*10\s*[\r\n]\s*([\-\d\.]+)/],
  "20": [/[\r\n]\s*20\s*[\r\n]\s*([\-\d\.]+)/, /[\r\n]\s*20\s*[\r\n]\s*([\-\d\.]+)/],
  "11": [/[\r\n]\s*11\s*[\r\n]\s*([\-\d\.]+)/, /[\r\n]\s*11\s*[\r\n]\s*([\-\d\.]+)/],
  "21": [/[\r\n]\s*21\s*[\r\n]\s*([\-\d\.]+)/, /[\r\n]\s*21\s*[\r\n]\s*([\-\d\.]+)/],
};

function extractGroupCode(chunk: string, code: string): number | null {
  const reList = GROUP_CODE_PATTERNS[code];
  if (!reList) return null;
  for (const re of reList) {
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

  const debugInfo = {
    entityCount: segments.length,
    candidateCount: segments.length,
    outlierCount: 0,
    minX: Math.round(minX),
    maxX: Math.round(maxX),
    minY: Math.round(minY),
    maxY: Math.round(maxY),
    unit: scale === 100 ? "Metre (m)" : scale === 0.1 ? "Milimetre (mm)" : "Santimetre (cm)",
    rawWidth: Math.round(spanX),
    rawHeight: Math.round(spanY),
    widthCm: Math.round(spanX * scale),
    heightCm: Math.round(spanY * scale),
    scaleFactor: scale,
    largestEntityType: "LINE",
    largestEntitySize: Math.round(Math.hypot(spanX, spanY)),
    smallestEntityType: "LINE",
    smallestEntitySize: 0,
    typeDistribution: `LINE: ${segments.length}`,
  };

  const traceSegments: TraceSegment[] = segments.map((s) => ({
    a: { x: Math.round((s.p1.x - minX) * scale), y: Math.round((s.p1.y - minY) * scale) },
    b: { x: Math.round((s.p2.x - minX) * scale), y: Math.round((s.p2.y - minY) * scale) },
  }));

  return {
    kind: "vector",
    apply: (variant) => applyTraceSegments(variant, traceSegments, debugInfo),
    segmentCount: traceSegments.length,
    success: traceSegments.length > 0,
    message:
      `DWG dosyası (${fileName} — ${headerStr}) içindeki gömülü DXF metin bloğundan ${traceSegments.length} ` +
      `çizgi segmenti bulundu ve kroki olarak eklendi (hiçbir otomatik duvar/oda ataması yapılmadı). ` +
      `Ölçek birimi dosyada standart olmadığından otomatik bir varsayım (×${scale}) uygulandı — ölçüleri kontrol edin.`,
  };
}
