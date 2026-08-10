// Web Worker: DWG→DXF WASM dönüşümünü VE DXF ayrıştırmasını ana (UI) thread'in
// DIŞINDA yapar.
//
// `LibreDwg.dwg_write_dxf()` senkron bir WASM çağrısıdır — büyük/karmaşık gerçek
// DWG dosyalarında saniyeler sürebilir ve JavaScript senkron bir çağrının ORTASINDA
// event loop'a geri dönemeyeceği için (WASM yürütme bitene kadar) bu, çağrıldığı
// thread'i tamamen kilitler. Ana thread'de çağrılırsa tarayıcı "Sayfa Yanıt Vermiyor"
// gösterir (kullanıcının bildirdiği donma tam olarak buydu). Bu worker `@mlightcad/
// libredwg-web` paketinin kendi ortam algılamasında (ENVIRONMENT_IS_WORKER) zaten
// desteklenen bir Worker bağlamında çalışır, böylece kilitlenen sadece bu arka plan
// thread'i olur — sayfa/UI tamamen duyarlı kalır.
//
// Not: burada hiçbir grafik/döngü algoritması (duvar/oda tespiti) YOKTUR — dosya
// yalnızca düz bir çizgi listesine çevrilir (§ "otomatik tanıma yapmasın, dosyayı
// olduğu gibi açsın"). Bu hem daha basit hem de kat kat daha hızlıdır.

import { dxfTextToScaledLoops, loopsToTraceSegments, type TraceSegment } from "./vectorGraph";

export interface DwgWorkerRequest {
  buffer: ArrayBuffer;
  wasmDir: string;
}

export type DwgWorkerResponse = { ok: true; segments: TraceSegment[]; scaleNote: string; debugInfo?: any } | { ok: false; reason: string };

self.onmessage = async (e: MessageEvent<DwgWorkerRequest>) => {
  const { buffer, wasmDir } = e.data;
  try {
    const { LibreDwg } = await import("@mlightcad/libredwg-web");
    const libredwg = await LibreDwg.create(wasmDir);
    const dxfBytes = libredwg.dwg_write_dxf(buffer);
    if (!dxfBytes || dxfBytes.length === 0) {
      (self as unknown as Worker).postMessage({ ok: false, reason: "empty" } satisfies DwgWorkerResponse);
      return;
    }

    const dxfText = new TextDecoder("utf-8", { fatal: false }).decode(dxfBytes);
    const { loops, scaleNote, debugInfo } = dxfTextToScaledLoops(dxfText);
    const segments = loopsToTraceSegments(loops);

    const response: DwgWorkerResponse = { ok: true, segments, scaleNote, debugInfo };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: DwgWorkerResponse = { ok: false, reason: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(response);
  }
};
