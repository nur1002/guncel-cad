// Saf (side-effect'siz), Worker-güvenli DXF ayrıştırma + grafik filtreleme mantığı.
// `FloorVariantData`/store'a hiç dokunmaz — bu yüzden hem ana thread'de hem de bir
// Web Worker içinde aynen çalışır. Ağır iş (büyük dosyalarda binlerce satır ayrıştırma
// + grafik döngü tespiti) burada yapılır; sonucu store'a yazmak (hızlı, O(n) toplu
// ekleme) çağıran taraf (dxfImport.ts / dwgImport.ts) sorumluluğundadır.

import { findCycleEdges, type Pt } from "../drawing/geometry";

export interface RawLoop {
  points: Pt[];
  closed: boolean;
  type?: string; // LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, HATCH, SOLID, IMAGE, WIPEOUT, UNDERLAY
}

export interface FilteredGraph {
  /** Tekilleştirilmiş (dosyada birebir aynı koordinata sahip uçların birleştiği) köşeler. */
  points: Pt[];
  /** Kapalı bir döngünün parçası olan (köprü OLMAYAN) segmentler — bunlar duvara çevrilir. */
  wallPairs: [number, number][];
  /** Kapalı bir döngüye ait olmadığı için atlanan segment sayısı. */
  skippedCount: number;
}

const EPS_CM = 0.01;

export interface TraceSegment {
  a: Pt;
  b: Pt;
  type?: string;
}

/**
 * Ham nokta döngülerini, HİÇBİR yorumlama/filtreleme yapmadan düz bir çizgi
 * listesine çevirir (§ "otomatik tanıma yapmasın, dosyayı olduğu gibi açsın").
 * Wall/Corner/Room üretmez, köşe birleştirme/döngü tespiti yapmaz — bu yüzden
 * DXF/DWG'nin ağır grafik-algoritma yolundan çok daha hızlıdır (yalnızca O(n)
 * düzleştirme).
 */
export function loopsToTraceSegments(loops: RawLoop[]): TraceSegment[] {
  const segments: TraceSegment[] = [];
  for (const loop of loops) {
    if (loop.points.length < 2) continue;
    const segCount = loop.closed ? loop.points.length : loop.points.length - 1;
    for (let i = 0; i < segCount; i++) {
      segments.push({
        a: loop.points[i],
        b: loop.points[(i + 1) % loop.points.length],
        type: loop.type,
      });
    }
  }
  return segments;
}

export interface CenteredTrace {
  segments: TraceSegment[]; // bbox merkezine göre yerel koordinatlar (0,0 = merkez)
  widthCm: number;
  heightCm: number;
}

/**
 * Segmentleri kendi bounding box'larının MERKEZİNE göre yerel koordinatlara kaydırır
 * (§ "Bounding box hesaplanır... parsel merkezine yerleştirilir" akışı — bu merkez
 * daha sonra `VectorTrace.x/y` ile dünya konumuna eşlenir).
 * Devasa uzaklıktaki outlier'ların (örn. sayfa kenarlığı, uzaktaki lejant) merkezin
 * kaymasına yol açmasını engellemek için robust (median-bazlı) bir bbox hesabı kullanır.
 */
export function centerTraceSegments(segments: TraceSegment[]): CenteredTrace {
  if (segments.length === 0) return { segments: [], widthCm: 0, heightCm: 0 };

  // Her segmentin sınırlarını ve merkezini bulalım
  const segInfos = segments.map((s) => {
    const minX = Math.min(s.a.x, s.b.x);
    const maxX = Math.max(s.a.x, s.b.x);
    const minY = Math.min(s.a.y, s.b.y);
    const maxY = Math.max(s.a.y, s.b.y);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const size = Math.hypot(maxX - minX, maxY - minY);
    return { minX, maxX, minY, maxY, cx, cy, size, seg: s };
  });

  // Merkez noktalarının medyan değerlerini bulalım
  const cxs = segInfos.map((si) => si.cx).sort((a, b) => a - b);
  const cys = segInfos.map((si) => si.cy).sort((a, b) => a - b);
  const medianX = cxs[Math.floor(cxs.length / 2)];
  const medianY = cys[Math.floor(cys.length / 2)];

  // Medyana göre uzaklıkları hesaplayalım
  const distances = segInfos.map((si) => Math.hypot(si.cx - medianX, si.cy - medianY));
  const sortedDistances = [...distances].sort((a, b) => a - b);
  const medianDist = sortedDistances[Math.floor(sortedDistances.length / 2)] || 0;

  const sizes = segInfos.map((si) => si.size).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)] || 0;

  // Filtreleme eşikleri
  const distThreshold = Math.max(medianDist * 8, medianSize * 10, 5000);
  const sizeThreshold = Math.max(medianSize * 8, 10000);

  // IMAGE, WIPEOUT, UNDERLAY, HATCH türündeki segmentleri bounding box hesaplamasının dışında tutuyoruz
  const bboxExcludedTypes = new Set(["IMAGE", "WIPEOUT", "UNDERLAY", "HATCH"]);
  const candidates = segInfos.filter(
    (si) => !si.seg.type || !bboxExcludedTypes.has(si.seg.type)
  );

  const filterTarget = candidates.length > 0 ? candidates : segInfos;
  const nonOutliers = filterTarget.filter((si) => {
    const origIdx = segInfos.indexOf(si);
    const dist = distances[origIdx];
    return dist <= distThreshold && si.size <= sizeThreshold;
  });

  const finalInfos = nonOutliers.length > 0 ? nonOutliers : filterTarget;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const si of finalInfos) {
    if (si.minX < minX) minX = si.minX;
    if (si.minY < minY) minY = si.minY;
    if (si.maxX > maxX) maxX = si.maxX;
    if (si.maxY > maxY) maxY = si.maxY;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Tüm segmentleri (outlier'lar dahil) robust merkeze göre kaydıralım
  const centered = segments.map((s) => ({
    a: { x: s.a.x - cx, y: s.a.y - cy },
    b: { x: s.b.x - cx, y: s.b.y - cy },
    type: s.type,
  }));

  return {
    segments: centered,
    widthCm: maxX - minX,
    heightCm: maxY - minY,
  };
}

/**
 * Ham nokta döngülerinden (LINE/POLYLINE/ARC/CIRCLE'dan gelen) filtrelenmiş bir
 * duvar grafiği üretir: yalnızca KAPALI BİR DÖNGÜNÜN parçası olan segmentler tutulur
 * (mobilya/ölçü/tarama gibi tek başına duran çizgiler atlanır — "sadece odaları/4
 * köşesi birleşen yerleri tanısın" kuralı). Köşeler O(1) hash ile tekilleştirilir.
 */
export function buildFilteredGraph(loops: RawLoop[]): FilteredGraph {
  const points: Pt[] = [];
  const indexOf = new Map<string, number>();
  const keyOf = (p: Pt) => `${Math.round(p.x / EPS_CM)},${Math.round(p.y / EPS_CM)}`;
  const idxFor = (p: Pt): number => {
    const key = keyOf(p);
    let idx = indexOf.get(key);
    if (idx === undefined) {
      idx = points.length;
      points.push(p);
      indexOf.set(key, idx);
    }
    return idx;
  };

  const rawPairs: [number, number][] = [];
  for (const loop of loops) {
    if (loop.points.length < 2) continue;
    const ids = loop.points.map(idxFor);
    const segCount = loop.closed ? ids.length : ids.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      if (a !== b) rawPairs.push([a, b]);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const [a, b] of rawPairs) {
    const ak = String(a);
    const bk = String(b);
    if (!adjacency.has(ak)) adjacency.set(ak, new Set());
    if (!adjacency.has(bk)) adjacency.set(bk, new Set());
    adjacency.get(ak)!.add(bk);
    adjacency.get(bk)!.add(ak);
  }
  const cycleEdges = findCycleEdges(adjacency);

  const uniquePairs = new Map<string, [number, number]>();
  let skippedCount = 0;
  for (const [a, b] of rawPairs) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (uniquePairs.has(key)) continue;
    if (!cycleEdges.has(key)) {
      skippedCount++;
      continue;
    }
    uniquePairs.set(key, [a, b]);
  }

  return { points, wallPairs: [...uniquePairs.values()], skippedCount };
}

// --- DXF metin ayrıştırma (LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE, HATCH, SOLID, IMAGE, WIPEOUT, UNDERLAY) ---

const ARC_SEGMENTS = 16;
const CIRCLE_SEGMENTS = 24;

/**
 * `parseFloat` katman adı/blok adı/metin gibi SAYISAL OLMAYAN bir değeri sessizce
 * kabul eder: `parseFloat("0-WALLS")` → `0`, `parseFloat("1-DOORS")` → `1` döner
 * (NaN değil!). Grup kodu/değer hizası herhangi bir noktada kayarsa (beklenmedik
 * bir entity yapısı, XDATA vb.) bu tür bir string yanlışlıkla "geçerli" küçük bir
 * koordinat gibi okunup geometriye karışabilir — köşelerden köşelere uzanan sahte
 * "yelpaze" çizgilerinin olası nedenlerinden biri budur. `Number()` ise TÜM string
 * sayısal değilse NaN döner, bu yüzden burada ondan kullanılıyor: bozuk veri sessizce
 * "gerçekmiş gibi" kabul edilmek yerine `Number.isFinite()` kontrolleriyle reddedilir.
 */
function strictNum(v: string): number {
  return Number(v);
}

function arcToPoints(cx: number, cy: number, r: number, startDeg: number, endDeg: number): Pt[] {
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360;
  const pts: Pt[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const a = ((startDeg + (sweep * i) / ARC_SEGMENTS) * Math.PI) / 180;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function circleToPoints(cx: number, cy: number, r: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/**
 * Tek bir DXF varlığını güvenli şekilde ayrıştırır. Koordinat eksikliklerinde
 * 0'a default etmek yerine hata/NaN kontrolleri ile null dönerek koruma sağlar.
 */
function parseSingleDxfEntity(
  type: string,
  lines: string[],
  startIdx: number,
  len: number
): { entity: RawLoop | null; nextIdx: number } {
  let i = startIdx;
  let entity: RawLoop | null = null;

  if (type === "LINE") {
    let x1: number | null = null, y1: number | null = null;
    let x2: number | null = null, y2: number | null = null;
    while (i + 1 < len) {
      const c = lines[i].trim();
      const v = lines[i + 1].trim();
      if (c === "0") break;
      if (c === "10") x1 = strictNum(v);
      else if (c === "20") y1 = strictNum(v);
      else if (c === "11") x2 = strictNum(v);
      else if (c === "21") y2 = strictNum(v);
      i += 2;
    }
    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
      if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
        entity = { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], closed: false, type: "LINE" };
      }
    }
  } else if (type === "LWPOLYLINE") {
    const xs: number[] = [];
    const ys: number[] = [];
    let closed = false;
    while (i + 1 < len) {
      const c = lines[i].trim();
      const v = lines[i + 1].trim();
      if (c === "0") break;
      if (c === "70") closed = (parseInt(v, 10) & 1) === 1;
      else if (c === "10") xs.push(strictNum(v));
      else if (c === "20") ys.push(strictNum(v));
      i += 2;
    }
    const points: Pt[] = [];
    const count = Math.min(xs.length, ys.length);
    for (let k = 0; k < count; k++) {
      if (Number.isFinite(xs[k]) && Number.isFinite(ys[k])) {
        points.push({ x: xs[k], y: ys[k] });
      }
    }
    if (points.length >= 2) {
      entity = { points, closed, type: "LWPOLYLINE" };
    }
  } else if (type === "POLYLINE") {
    let closed = false;
    while (i + 1 < len) {
      const c = lines[i].trim();
      const v = lines[i + 1].trim();
      if (c === "0") break;
      if (c === "70") closed = (parseInt(v, 10) & 1) === 1;
      i += 2;
    }
    const points: Pt[] = [];
    while (i + 1 < len) {
      const c = lines[i].trim();
      const v = lines[i + 1].trim();
      if (c === "0" && v === "SEQEND") {
        i += 2;
        break;
      }
      if (c === "0" && v === "VERTEX") {
        i += 2;
        let vx: number | null = null;
        let vy: number | null = null;
        while (i + 1 < len) {
          const vc = lines[i].trim();
          const vv = lines[i + 1].trim();
          if (vc === "0") break;
          if (vc === "10") vx = strictNum(vv);
          else if (vc === "20") vy = strictNum(vv);
          i += 2;
        }
        if (vx !== null && vy !== null && Number.isFinite(vx) && Number.isFinite(vy)) {
          points.push({ x: vx, y: vy });
        }
        continue;
      }
      i += 2;
    }
    if (points.length >= 2) {
      entity = { points, closed, type: "POLYLINE" };
    }
  } else if (type === "ARC") {
    let cx: number | null = null, cy: number | null = null, r: number | null = null;
    let startDeg = 0, endDeg = 360;
    while (i + 1 < len) {
      const c = lines[i].trim();
      const v = lines[i + 1].trim();
      if (c === "0") break;
      if (c === "10") cx = strictNum(v);
      else if (c === "20") cy = strictNum(v);
      else if (c === "40") r = strictNum(v);
      else if (c === "50") startDeg = strictNum(v);
      else if (c === "51") endDeg = strictNum(v);
      i += 2;
    }
    if (cx !== null && cy !== null && r !== null && r > 0) {
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r) && Number.isFinite(startDeg) && Number.isFinite(endDeg)) {
        entity = { points: arcToPoints(cx, cy, r, startDeg, endDeg), closed: false, type: "ARC" };
      }
    }
  } else if (type === "CIRCLE") {
    let cx: number | null = null, cy: number | null = null, r: number | null = null;
    while (i + 1 < len) {
      const c = lines[i].trim();
      const v = lines[i + 1].trim();
      if (c === "0") break;
      if (c === "10") cx = strictNum(v);
      else if (c === "20") cy = strictNum(v);
      else if (c === "40") r = strictNum(v);
      i += 2;
    }
    if (cx !== null && cy !== null && r !== null && r > 0) {
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r)) {
        entity = { points: circleToPoints(cx, cy, r), closed: true, type: "CIRCLE" };
      }
    }
  } else if (type === "SOLID") {
    let x1: number | null = null, y1: number | null = null;
    let x2: number | null = null, y2: number | null = null;
    let x3: number | null = null, y3: number | null = null;
    let x4: number | null = null, y4: number | null = null;
    let has4 = false;
    while (i + 1 < len) {
      const c = lines[i].trim();
      const v = lines[i + 1].trim();
      if (c === "0") break;
      if (c === "10") x1 = strictNum(v);
      else if (c === "20") y1 = strictNum(v);
      else if (c === "11") x2 = strictNum(v);
      else if (c === "21") y2 = strictNum(v);
      else if (c === "12") x3 = strictNum(v);
      else if (c === "22") y3 = strictNum(v);
      else if (c === "13") {
        x4 = strictNum(v);
        has4 = true;
      } else if (c === "23") {
        y4 = strictNum(v);
      }
      i += 2;
    }
    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null && x3 !== null && y3 !== null) {
      if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2) && Number.isFinite(x3) && Number.isFinite(y3)) {
        const pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }];
        if (has4 && x4 !== null && y4 !== null && Number.isFinite(x4) && Number.isFinite(y4)) {
          pts.push({ x: x4, y: y4 });
        }
        entity = { points: pts, closed: true, type: "SOLID" };
      }
    }
  } else if (type === "IMAGE" || type === "WIPEOUT" || type === "UNDERLAY") {
    // HATCH ile aynı sınıf hata: grup kodu 11/12 burada bir köşe noktası değil,
    // ekleme noktasına göre bir YÖN VEKTÖRÜ (U/V ekseni) — "10,11,12,13"ü ham x,
    // "20,21,22,23"ü ham y sayıp ikili eşlemek yanlış/anlamsız bir dörtgen üretir.
    // Referans görsel/kırpma niteliğindeki bu varlıklar mimari sınır değildir; aynı
    // "uydurma yerine dürüstçe atla" ilkesiyle burada da geometriye dahil edilmez.
    while (i + 1 < len) {
      const c = lines[i].trim();
      if (c === "0") break;
      i += 2;
    }
  } else if (type === "HATCH") {
    // BİLİNÇLİ OLARAK GEOMETRİ ÜRETİLMİYOR: HATCH'in grup kodu 10/20'si üç FARKLI
    // anlama gelebilir — (a) entity başındaki "elevation point" (sınırla ilgisiz),
    // (b) sınır (boundary) path'indeki kenar verisi (edge tipine göre: LINE
    // kenarında başlangıç noktası ama ARC/ELLIPSE kenarında YARIÇAP MERKEZİ, SPLINE
    // kenarında kontrol noktası), (c) sonda gelen "seed point" (ilişkisel/associative
    // hatch için tıklanan referans noktası, sınırın bir parçası DEĞİL). Düz bir
    // "her 10/20 çifti bir köşe" taraması bunları ayırt edemez ve merkezdeki
    // elevation/seed noktalarına sahte köşegen çizgiler çeker — bu, kullanıcının
    // bildirdiği "tek bir noktadan yayılan onlarca çizgi" hatasının doğrulanmış
    // kaynağıydı (bkz. bu bloğun üstündeki commit/rapor). HATCH'ler dolgu deseni
    // göstergesidir, mimari sınır DEĞİLDİR — gerçek duvar/oda hatları zaten ayrı
    // LINE/POLYLINE varlıklarıyla geliyor, bu yüzden burada UYDURMA yerine dürüstçe
    // atlanır (entity=null, ama gövdesi yine de doğru şekilde bir sonraki "0"a kadar
    // geçilir ki ayrıştırıcı hizası bozulmasın).
    while (i + 1 < len) {
      const c = lines[i].trim();
      if (c === "0") break;
      i += 2;
    }
  } else {
    // Bilinmeyen veya desteklenmeyen tipte ise, bir sonraki entity'ye kadar grup kodlarını atlayalım
    while (i + 1 < len) {
      const c = lines[i].trim();
      if (c === "0") break;
      i += 2;
    }
  }

  return { entity, nextIdx: i };
}

export function parseDxfEntitiesFromText(text: string): RawLoop[] {
  const lines = text.split(/\r\n|\r|\n/);
  const len = lines.length;
  const entities: RawLoop[] = [];
  const blocks = new Map<string, { name: string; baseX: number; baseY: number; entities: RawLoop[] }>();
  const inserts: { blockName: string; x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number }[] = [];

  let i = 0;
  let inEntities = false;
  let inSection = "";

  const SUPPORTED = new Set([
    "LINE", "LWPOLYLINE", "POLYLINE", "VERTEX", "SEQEND", "ARC", "CIRCLE",
    "HATCH", "SOLID", "IMAGE", "WIPEOUT", "UNDERLAY"
  ]);

  while (i + 1 < len) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();

    if (code === "0" && value === "SECTION") {
      inSection = "";
      i += 2;
      continue;
    }
    if (code === "2" && inSection === "") {
      inSection = value;
      inEntities = (inSection === "ENTITIES");
      i += 2;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      inEntities = false;
      inSection = "";
      i += 2;
      continue;
    }

    // BLOCKS section block definition parsing
    if (inSection === "BLOCKS" && code === "0" && value === "BLOCK") {
      let blockName = "";
      let baseX = 0;
      let baseY = 0;
      i += 2;
      while (i + 1 < len) {
        const c = lines[i].trim();
        const v = lines[i + 1].trim();
        if (c === "0") break;
        if (c === "2") blockName = v;
        else if (c === "10") baseX = strictNum(v);
        else if (c === "20") baseY = strictNum(v);
        i += 2;
      }

      const blockEntities: RawLoop[] = [];
      while (i + 1 < len) {
        const c = lines[i].trim();
        const v = lines[i + 1].trim();
        if (c === "0" && v === "ENDBLK") {
          i += 2;
          break;
        }
        if (c === "0") {
          const res = parseSingleDxfEntity(v, lines, i + 2, len);
          if (res.entity) {
            blockEntities.push(res.entity);
          }
          i = res.nextIdx;
          continue;
        }
        i += 2;
      }

      if (blockName) {
        blocks.set(blockName, {
          name: blockName,
          baseX,
          baseY,
          entities: blockEntities,
        });
      }
      continue;
    }

    // ENTITIES section entity parsing
    if (inEntities && code === "0") {
      if (value === "INSERT") {
        let blockName = "";
        let insertX: number | null = null;
        let insertY: number | null = null;
        let scaleX = 1;
        let scaleY = 1;
        let rotationDeg = 0;
        i += 2;
        while (i + 1 < len) {
          const c = lines[i].trim();
          const v = lines[i + 1].trim();
          if (c === "0") break;
          if (c === "2") blockName = v;
          else if (c === "10") insertX = strictNum(v);
          else if (c === "20") insertY = strictNum(v);
          else if (c === "41") scaleX = strictNum(v);
          else if (c === "42") scaleY = strictNum(v);
          else if (c === "50") rotationDeg = strictNum(v);
          i += 2;
        }

        if (blockName && insertX !== null && insertY !== null) {
          if (Number.isFinite(insertX) && Number.isFinite(insertY) && Number.isFinite(scaleX) && Number.isFinite(scaleY) && Number.isFinite(rotationDeg)) {
            inserts.push({
              blockName,
              x: insertX,
              y: insertY,
              scaleX,
              scaleY,
              rotationDeg,
            });
          }
        }
        continue;
      } else if (SUPPORTED.has(value) && value !== "VERTEX" && value !== "SEQEND") {
        const res = parseSingleDxfEntity(value, lines, i + 2, len);
        if (res.entity) {
          entities.push(res.entity);
        }
        i = res.nextIdx;
        continue;
      }
    }

    i += 2;
  }

  // Instantiate block inserts
  for (const insert of inserts) {
    const block = blocks.get(insert.blockName);
    if (!block) continue;

    const rad = (insert.rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    for (const blockEnt of block.entities) {
      const instPoints: Pt[] = blockEnt.points.map((p) => {
        const lx = p.x - block.baseX;
        const ly = p.y - block.baseY;

        const sx = lx * insert.scaleX;
        const sy = ly * insert.scaleY;

        const rx = sx * cosR - sy * sinR;
        const ry = sx * sinR + sy * cosR;

        return {
          x: rx + insert.x,
          y: ry + insert.y,
        };
      });

      entities.push({
        points: instPoints,
        closed: blockEnt.closed,
        type: blockEnt.type,
      });
    }
  }

  return entities;
}

// --- Merkezi Birim Dönüşümü (Unit Conversion) ---

export function convertUnit(val: number, from: string, to: string): number {
  const toKey = (u: string) => {
    u = u.toLowerCase().trim();
    if (u === "mm" || u === "millimeter" || u === "millimeters") return "mm";
    if (u === "cm" || u === "centimeter" || u === "centimeters") return "cm";
    if (u === "m" || u === "meter" || u === "meters") return "m";
    if (u === "in" || u === "inch" || u === "inches") return "in";
    return "cm";
  };

  const fK = toKey(from);
  const tK = toKey(to);

  if (fK === tK) return val;

  let valInCm = val;
  if (fK === "mm") valInCm = val * 0.1;
  else if (fK === "m") valInCm = val * 100;
  else if (fK === "in") valInCm = val * 2.54;
  else if (fK === "cm") valInCm = val;

  if (tK === "mm") return valInCm * 10;
  if (tK === "m") return valInCm * 0.01;
  if (tK === "in") return valInCm / 2.54;
  return valInCm;
}

export function parseInsunitsFromText(text: string): number {
  const lines = text.split(/\r\n|\r|\n/);
  const len = lines.length;
  // İlk 5000 satırda INSUNITS header parametresini arayalım
  for (let idx = 0; idx < Math.min(len - 2, 5000); idx++) {
    if (lines[idx].trim() === "$INSUNITS") {
      if (lines[idx + 1].trim() === "70") {
        const val = parseInt(lines[idx + 2].trim(), 10);
        if (!isNaN(val)) return val;
      }
    }
  }
  return 0; // Unspecified
}

export function mapInsunitsToUnitName(insunits: number): string {
  switch (insunits) {
    case 1: return "in";
    case 4: return "mm";
    case 5: return "cm";
    case 6: return "m";
    case 14: return "dm";
    default: return "cm"; // default fallback
  }
}

export function detectDefaultUnitBySpan(spanX: number, spanY: number): string {
  const maxSpan = Math.max(spanX, spanY);
  if (maxSpan < 150) {
    return "m";
  } else if (maxSpan > 25000) {
    return "mm";
  }
  return "cm";
}

export function calculateRobustBBox(
  entities: { points: Pt[]; type?: string }[]
): { bbox: { minX: number; maxX: number; minY: number; maxY: number }; debug: any } {
  // IMAGE, WIPEOUT, UNDERLAY, HATCH'i bounding box hesabından hariç tutalım
  const bboxExcludedTypes = new Set(["IMAGE", "WIPEOUT", "UNDERLAY", "HATCH"]);
  const candidateEntities = entities.filter(
    (e) => !e.type || !bboxExcludedTypes.has(e.type)
  );

  if (candidateEntities.length === 0) {
    return calculateSimpleBBox(entities);
  }

  // Her varlığın sınırını ve geometrik merkezini bulalım
  const entityInfos = candidateEntities.map((e) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of e.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = maxX - minX;
    const h = maxY - minY;
    const size = Math.hypot(w, h);
    return { minX, maxX, minY, maxY, cx, cy, size, entity: e };
  });

  const cxs = entityInfos.map((ei) => ei.cx).sort((a, b) => a - b);
  const cys = entityInfos.map((ei) => ei.cy).sort((a, b) => a - b);
  const medianX = cxs[Math.floor(cxs.length / 2)];
  const medianY = cys[Math.floor(cys.length / 2)];

  const distances = entityInfos.map((ei) => Math.hypot(ei.cx - medianX, ei.cy - medianY));
  const sortedDistances = [...distances].sort((a, b) => a - b);
  const medianDist = sortedDistances[Math.floor(sortedDistances.length / 2)] || 0;

  const sizes = entityInfos.map((ei) => ei.size).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)] || 0;

  // Devasa boyut ve uzaklık limitleri
  const distThreshold = Math.max(medianDist * 8, medianSize * 10, 5000);
  const sizeThreshold = Math.max(medianSize * 8, 10000);

  const nonOutliers = entityInfos.filter((ei) => {
    const origIdx = entityInfos.indexOf(ei);
    const dist = distances[origIdx];
    const isSpatialOutlier = dist > distThreshold;
    const isSizeOutlier = ei.size > sizeThreshold;
    return !isSpatialOutlier && !isSizeOutlier;
  });

  const finalInfos = nonOutliers.length > 0 ? nonOutliers : entityInfos;
  const outlierCount = entityInfos.length - finalInfos.length;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ei of finalInfos) {
    if (ei.minX < minX) minX = ei.minX;
    if (ei.minY < minY) minY = ei.minY;
    if (ei.maxX > maxX) maxX = ei.maxX;
    if (ei.maxY > maxY) maxY = ei.maxY;
  }

  let largestEntity = null;
  let smallestEntity = null;
  if (entityInfos.length > 0) {
    const sortedBySize = [...entityInfos].sort((a, b) => b.size - a.size);
    largestEntity = sortedBySize[0];
    smallestEntity = sortedBySize[sortedBySize.length - 1];
  }

  const typeCounts: Record<string, number> = {};
  for (const e of entities) {
    const t = e.type || "UNKNOWN";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  return {
    bbox: { minX, maxX, minY, maxY },
    debug: {
      entityCount: entities.length,
      candidateCount: candidateEntities.length,
      outlierCount,
      minX,
      maxX,
      minY,
      maxY,
      largestEntityType: largestEntity?.entity.type || "LINE",
      largestEntitySize: Math.round(largestEntity?.size || 0),
      smallestEntityType: smallestEntity?.entity.type || "LINE",
      smallestEntitySize: Math.round(smallestEntity?.size || 0),
      typeDistribution: Object.entries(typeCounts).map(([t, c]) => `${t}: ${c}`).join(", "),
    },
  };
}

export function calculateSimpleBBox(
  entities: { points: Pt[] }[]
): { bbox: { minX: number; maxX: number; minY: number; maxY: number }; debug: any } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entities) {
    for (const p of e.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return {
    bbox: { minX, maxX, minY, maxY },
    debug: {
      entityCount: entities.length,
      candidateCount: entities.length,
      outlierCount: 0,
      minX,
      maxX,
      minY,
      maxY,
      largestEntityType: "LINE",
      largestEntitySize: 0,
      smallestEntityType: "LINE",
      smallestEntitySize: 0,
      typeDistribution: `LINE: ${entities.length}`,
    },
  };
}

/** DXF metnini, standart olmayan birim varsayımıyla (1 birim = 100 cm) cm'ye ölçekli döngülere çevirir. */
export function dxfTextToScaledLoops(text: string): { loops: RawLoop[]; scaleNote: string; debugInfo: any } {
  const entities = parseDxfEntitiesFromText(text).filter((e) => e.points.length >= 2);
  if (entities.length === 0) {
    throw new Error("DXF içinde desteklenen bir varlık (LINE/LWPOLYLINE/POLYLINE/ARC/CIRCLE) bulunamadı.");
  }

  // 1. INSUNITS Header birim bilgisi okunur
  const insunits = parseInsunitsFromText(text);
  let detectedUnit = mapInsunitsToUnitName(insunits);

  // 2. Birim unspecified (0) ise raw koordinat genişliğine göre heuristik varsayım yapılır
  const rawBBoxResult = calculateSimpleBBox(entities);
  const rawWidth = rawBBoxResult.bbox.maxX - rawBBoxResult.bbox.minX;
  const rawHeight = rawBBoxResult.bbox.maxY - rawBBoxResult.bbox.minY;

  let isAutoDetected = false;
  if (insunits === 0) {
    detectedUnit = detectDefaultUnitBySpan(rawWidth, rawHeight);
    isAutoDetected = true;
  }

  // 3. Robust BBox hesaplanır (raw koordinatlarında)
  const robustBBoxResult = calculateRobustBBox(entities);
  const bbox = robustBBoxResult.bbox;

  // 4. cm ölçekli bounding box genişlik/yükseklikleri
  const widthCm = convertUnit(bbox.maxX - bbox.minX, detectedUnit, "cm");
  const heightCm = convertUnit(bbox.maxY - bbox.minY, detectedUnit, "cm");

  // 5. Tüm koordinatları cm'ye çevirip loops listesi oluşturuyoruz
  const loops = entities.map((e) => ({
    points: e.points.map((p) => ({
      x: convertUnit(p.x, detectedUnit, "cm"),
      y: convertUnit(p.y, detectedUnit, "cm"),
    })),
    closed: e.closed,
    type: e.type,
  }));

  const unitLabels: Record<string, string> = {
    mm: "Milimetre (mm)",
    cm: "Santimetre (cm)",
    m: "Metre (m)",
    in: "İnç (inch)",
  };

  const scaleNote = isAutoDetected
    ? `Dosyada birim bilgisi bulunamadı. Koordinat dağılımına göre "${unitLabels[detectedUnit]}" varsayıldı.`
    : `Dosyadan okunan birim: "${unitLabels[detectedUnit]}".`;

  const debugInfo = {
    ...robustBBoxResult.debug,
    unit: unitLabels[detectedUnit] || `Unspecified (${insunits})`,
    rawWidth: Math.round(rawWidth),
    rawHeight: Math.round(rawHeight),
    widthCm: Math.round(widthCm),
    heightCm: Math.round(heightCm),
    scaleFactor: convertUnit(1, detectedUnit, "cm"),
  };

  return { loops, scaleNote, debugInfo };
}
