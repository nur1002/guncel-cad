// Saf (side-effect'siz), Worker-güvenli DXF ayrıştırma + grafik filtreleme mantığı.
// `FloorVariantData`/store'a hiç dokunmaz — bu yüzden hem ana thread'de hem de bir
// Web Worker içinde aynen çalışır. Ağır iş (büyük dosyalarda binlerce satır ayrıştırma
// + grafik döngü tespiti) burada yapılır; sonucu store'a yazmak (hızlı, O(n) toplu
// ekleme) çağıran taraf (dxfImport.ts / dwgImport.ts) sorumluluğundadır.

import { findCycleEdges, type Pt } from "../drawing/geometry";

export interface RawLoop {
  points: Pt[];
  closed: boolean;
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
      segments.push({ a: loop.points[i], b: loop.points[(i + 1) % loop.points.length] });
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
 */
export function centerTraceSegments(segments: TraceSegment[]): CenteredTrace {
  if (segments.length === 0) return { segments: [], widthCm: 0, heightCm: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seg of segments) {
    for (const p of [seg.a, seg.b]) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centered = segments.map((s) => ({
    a: { x: s.a.x - cx, y: s.a.y - cy },
    b: { x: s.b.x - cx, y: s.b.y - cy },
  }));
  return { segments: centered, widthCm: maxX - minX, heightCm: maxY - minY };
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

// --- DXF metin ayrıştırma (LINE, LWPOLYLINE, klasik POLYLINE/VERTEX, ARC, CIRCLE) ---
//
// Gerçek DWG→DXF dönüşümleri (LibreDWG WASM dahil) çoğunlukla yalnızca LINE/LWPOLYLINE
// değil, klasik POLYLINE (ayrı VERTEX alt-varlıklarıyla), ARC ve CIRCLE de üretir. Eğri
// varlıklar (ARC/CIRCLE) UYDURMA değil, kendi merkez/yarıçap/açı verilerinden matematiksel
// olarak kesin şekilde çokgene yaklaştırılır — tahmini geometri değildir.

const ARC_SEGMENTS = 16;
const CIRCLE_SEGMENTS = 24;

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

export function parseDxfEntitiesFromText(text: string): RawLoop[] {
  const lines = text.split(/\r\n|\r|\n/);
  const len = lines.length;
  const entities: RawLoop[] = [];
  let i = 0;
  let inEntities = false;

  const SUPPORTED = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "VERTEX", "SEQEND", "ARC", "CIRCLE"]);

  while (i + 1 < len) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();

    if (code === "2" && value === "ENTITIES") {
      inEntities = true;
      i += 2;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      inEntities = false;
      i += 2;
      continue;
    }

    if (inEntities && code === "0" && SUPPORTED.has(value) && value !== "VERTEX" && value !== "SEQEND") {
      const type = value;
      i += 2;
      if (type === "LINE") {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        while (i + 1 < len) {
          const c = lines[i].trim();
          const v = lines[i + 1].trim();
          if (c === "0") break;
          if (c === "10") x1 = parseFloat(v);
          else if (c === "20") y1 = parseFloat(v);
          else if (c === "11") x2 = parseFloat(v);
          else if (c === "21") y2 = parseFloat(v);
          i += 2;
        }
        entities.push({ points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], closed: false });
      } else if (type === "LWPOLYLINE") {
        const points: Pt[] = [];
        let closed = false;
        let curX: number | null = null;
        while (i + 1 < len) {
          const c = lines[i].trim();
          const v = lines[i + 1].trim();
          if (c === "0") break;
          if (c === "70") closed = (parseInt(v, 10) & 1) === 1;
          else if (c === "10") curX = parseFloat(v);
          else if (c === "20" && curX !== null) {
            points.push({ x: curX, y: parseFloat(v) });
            curX = null;
          }
          i += 2;
        }
        entities.push({ points, closed });
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
              if (vc === "10") vx = parseFloat(vv);
              else if (vc === "20") vy = parseFloat(vv);
              i += 2;
            }
            if (vx !== null && vy !== null) points.push({ x: vx, y: vy });
            continue;
          }
          i += 2;
        }
        entities.push({ points, closed });
      } else if (type === "ARC") {
        let cx = 0, cy = 0, r = 0, startDeg = 0, endDeg = 360;
        while (i + 1 < len) {
          const c = lines[i].trim();
          const v = lines[i + 1].trim();
          if (c === "0") break;
          if (c === "10") cx = parseFloat(v);
          else if (c === "20") cy = parseFloat(v);
          else if (c === "40") r = parseFloat(v);
          else if (c === "50") startDeg = parseFloat(v);
          else if (c === "51") endDeg = parseFloat(v);
          i += 2;
        }
        if (r > 0) entities.push({ points: arcToPoints(cx, cy, r, startDeg, endDeg), closed: false });
      } else if (type === "CIRCLE") {
        let cx = 0, cy = 0, r = 0;
        while (i + 1 < len) {
          const c = lines[i].trim();
          const v = lines[i + 1].trim();
          if (c === "0") break;
          if (c === "10") cx = parseFloat(v);
          else if (c === "20") cy = parseFloat(v);
          else if (c === "40") r = parseFloat(v);
          i += 2;
        }
        if (r > 0) entities.push({ points: circleToPoints(cx, cy, r), closed: true });
      }
      continue;
    }
    i += 2;
  }
  return entities;
}

/** DXF metnini, standart olmayan birim varsayımıyla (1 birim = 100 cm) cm'ye ölçekli döngülere çevirir. */
export function dxfTextToScaledLoops(text: string): { loops: RawLoop[]; scaleNote: string } {
  const entities = parseDxfEntitiesFromText(text).filter((e) => e.points.length >= 2);
  if (entities.length === 0) {
    throw new Error("DXF içinde desteklenen bir varlık (LINE/LWPOLYLINE/POLYLINE/ARC/CIRCLE) bulunamadı.");
  }
  const allPoints = entities.flatMap((e) => e.points);
  const minX = Math.min(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));
  const cmPerUnit = 100;
  const loops = entities.map((e) => ({
    points: e.points.map((p) => ({ x: (p.x - minX) * cmPerUnit, y: (p.y - minY) * cmPerUnit })),
    closed: e.closed,
  }));
  const scaleNote = "DXF biriminin metre olduğu varsayıldı (1 birim = 100 cm). Ölçek farklıysa duvarları yeniden çizmeniz gerekebilir.";
  return { loops, scaleNote };
}
