// Gelişmiş Snap (yapışma) + Akıllı Hizalama (Smart Guide) motoru. Saf fonksiyonlar:
// mevcut geometriye bakıp "imleç şu noktaya yapışmalı" ve "şu kılavuz çizgileri
// gösterilmeli" bilgisini üretir. Hiçbir state tutmaz, CanvasEditor her pointermove'da
// çağırır.

import type { FloorVariantData } from "../../data/model";
import { dist, type Pt } from "./geometry";

export type SnapKind = "corner" | "midpoint" | "intersection" | "grid" | "guide" | "angle";

export interface SnapPoint {
  point: Pt;
  kind: SnapKind;
}

export interface GuideLine {
  a: Pt;
  b: Pt;
  kind: "horizontal" | "vertical" | "angle";
  label?: string;
}

export interface SnapOptions {
  pxPerCm: number;
  snapEnabled: boolean;
  gridSnapEnabled: boolean;
  gridStepCm: number;
  snapRadiusPx?: number;
  guideRadiusPx?: number;
  /** Kılavuz hizalaması hesaplanırken referans alınacak noktalar (genelde tüm köşeler). */
  referencePoints?: Pt[];
  /** Sürüklemenin çapa noktası — açı kilidi ve kılavuzların çıkış noktası. */
  anchor?: Pt | null;
  /** Kılavuz çizgilerini çizerken görünür alanın büyüklüğü (ekranı kaplasın diye). */
  guideExtentCm?: number;
}

const DEFAULT_SNAP_RADIUS_PX = 12;
const DEFAULT_GUIDE_RADIUS_PX = 7;
const ANGLE_STEP_DEG = 45;
const ANGLE_THRESHOLD_DEG = 5;

/**
 * İçe aktarılan DWG/DXF krokisinin yerel (x,y) noktasını, krokinin yerleştirme
 * dönüşümüyle (konum+açı+ölçek) dünya koordinatına çevirir. `render2d.ts`'teki
 * `drawVectorTrace`'in canvas transform sırasıyla (scale→rotate→translate) BİREBİR
 * aynı olmalı, yoksa ekranda görünen çizgiyle snap noktası uyuşmaz.
 */
function traceLocalToWorld(trace: NonNullable<FloorVariantData["vectorTrace"]>, lx: number, ly: number): Pt {
  const rad = (trace.rotationDeg * Math.PI) / 180;
  const sx = lx * trace.scale;
  const sy = ly * trace.scale;
  return {
    x: trace.x + sx * Math.cos(rad) - sy * Math.sin(rad),
    y: trace.y + sx * Math.sin(rad) + sy * Math.cos(rad),
  };
}

/**
 * Büyük DWG/DXF krokileri (binlerce segment) için: her `resolveSnapPoint`/
 * `computeSmartGuides` çağrısında TÜM segmentleri yeniden dünya koordinatına
 * çevirip taramak (trig dahil) 20 binlik bir kroki için tek çağrıda ~27ms'e kadar
 * çıkıyordu — sürükleme sırasında her mousemove'da bu, gözle görülür bir
 * "kasma" yaratıyordu. Bu yüzden dünya koordinatına çevrilmiş segmentler VE bir
 * ızgara-hücre (spatial hash) indeksi, `trace` nesne referansı DEĞİŞMEDİĞİ sürece
 * (yani kullanıcı krokiyi sürüklemedikçe/döndürmedikçe) `WeakMap` ile önbelleğe
 * alınır — tekrarlanan çağrılar yalnızca yakın hücrelere bakar, trig yeniden
 * hesaplanmaz.
 */
const CELL_SIZE_CM = 300;
// Hücre anahtarları SAYISAL (string template literal DEĞİL) — 20 binlik bir kroki
// için string anahtarlı Map/Set (toFixed + template literal tahsisi) indeks
// oluşturmayı ~4 saniyeye kadar çıkarıyordu (ilk etkileşimde donma). Sayısal
// anahtar (bit/aralık paketleme) tahsis yapmaz, çok daha hızlıdır.
const CELL_OFFSET = 1_000_000;
const CELL_MODULUS = 2_000_001;
interface TraceWorldSegment {
  a: Pt;
  b: Pt;
}
interface TraceIndex {
  worldSegments: TraceWorldSegment[];
  cornerPoints: Pt[];
  cellBuckets: Map<number, number[]>; // hücre anahtarı -> worldSegments indeksleri
}
const traceIndexCache = new WeakMap<NonNullable<FloorVariantData["vectorTrace"]>, TraceIndex>();

function cellKey(cx: number, cy: number): number {
  return (cx + CELL_OFFSET) * CELL_MODULUS + (cy + CELL_OFFSET);
}

function buildTraceIndex(trace: NonNullable<FloorVariantData["vectorTrace"]>): TraceIndex {
  const worldSegments: TraceWorldSegment[] = [];
  // Köşe listesi TEKİLLEŞTİRİLMEZ: bir arama Set'i (string anahtarlı) burada asıl
  // maliyetliydi, oysa tekrar eden birkaç nokta sonraki doğrusal mesafe taramasını
  // (bkz. resolveSnapPoint) ölçülemeyecek kadar az yavaşlatır — güvenli bir ödünleşim.
  const cornerPoints: Pt[] = [];
  const cellBuckets = new Map<number, number[]>();

  for (const seg of trace.segments) {
    const a = traceLocalToWorld(trace, seg.a.x, seg.a.y);
    const b = traceLocalToWorld(trace, seg.b.x, seg.b.y);
    const idx = worldSegments.length;
    worldSegments.push({ a, b });
    cornerPoints.push(a, b);

    let cx0 = Math.floor(Math.min(a.x, b.x) / CELL_SIZE_CM);
    let cx1 = Math.floor(Math.max(a.x, b.x) / CELL_SIZE_CM);
    let cy0 = Math.floor(Math.min(a.y, b.y) / CELL_SIZE_CM);
    let cy1 = Math.floor(Math.max(a.y, b.y) / CELL_SIZE_CM);
    // Güvenlik sınırı: tek bir aşırı uzun/bozuk segment (ör. hatalı ölçekli bir
    // içe aktarım) binlerce hücreye eklenip indeks oluşturmayı donduramasın —
    // öyle bir segment yalnızca uç noktalarından (cornerPoints, zaten eklendi)
    // snap edilebilir olur, kenar-boyunca hassas snap'ten (nadiren gereken bir
    // uç durum) feragat edilir.
    const MAX_CELL_SPAN = 64;
    if (cx1 - cx0 > MAX_CELL_SPAN) cx1 = cx0 + MAX_CELL_SPAN;
    if (cy1 - cy0 > MAX_CELL_SPAN) cy1 = cy0 + MAX_CELL_SPAN;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = cellKey(cx, cy);
        let bucket = cellBuckets.get(key);
        if (!bucket) {
          bucket = [];
          cellBuckets.set(key, bucket);
        }
        bucket.push(idx);
      }
    }
  }

  return { worldSegments, cornerPoints, cellBuckets };
}

function getTraceIndex(trace: NonNullable<FloorVariantData["vectorTrace"]>): TraceIndex {
  const cached = traceIndexCache.get(trace);
  if (cached) return cached;
  const built = buildTraceIndex(trace);
  traceIndexCache.set(trace, built);
  return built;
}

/**
 * İçe aktarılan kroki (DWG/DXF) üzerinden ELLE çizim yapabilmek için (§ "otomatik
 * tanıma yapmasın, siz üzerinden çizin") krokinin kendi (tekilleştirilmiş) köşeleri
 * dünya koordinatına çevrilip döndürülür — yoksa kullanıcı referans çizgiye tam
 * denk gelemiyor, yalnızca ızgaraya/mevcut duvarlara yapışıyordu.
 */
function traceCornerWorldPoints(variant: FloorVariantData): Pt[] {
  if (!variant.vectorTrace || variant.vectorTrace.segments.length === 0) return [];
  return getTraceIndex(variant.vectorTrace).cornerPoints;
}

function pointCandidates(variant: FloorVariantData): SnapPoint[] {
  const out: SnapPoint[] = [];
  for (const c of Object.values(variant.corners)) {
    out.push({ point: { x: c.x, y: c.y }, kind: "corner" });
  }
  for (const w of Object.values(variant.walls)) {
    const a = variant.corners[w.a];
    const b = variant.corners[w.b];
    if (!a || !b) continue;
    out.push({ point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: "midpoint" });
  }
  for (const p of traceCornerWorldPoints(variant)) {
    out.push({ point: p, kind: "corner" });
  }
  return out;
}

/**
 * Bir dünya noktasının, krokideki EN YAKIN çizgi ÜZERİNDEKİ (uç noktalar dışında,
 * çizginin herhangi bir yerinde) izdüşümü — kullanıcı krokinin bir köşesine değil,
 * kenarının ortasına da tam olarak denk gelebilsin diye.
 */
function traceEdgeCandidate(variant: FloorVariantData, worldPt: Pt, radiusCm: number): SnapPoint | null {
  const trace = variant.vectorTrace;
  if (!trace || trace.segments.length === 0) return null;
  const index = getTraceIndex(trace);

  // Yalnızca sorgu noktasının hücresi + komşu hücrelerdeki segmentlere bak —
  // binlerce segmentin tamamını taramak yerine (bkz. yukarıdaki performans notu).
  const cx = Math.floor(worldPt.x / CELL_SIZE_CM);
  const cy = Math.floor(worldPt.y / CELL_SIZE_CM);
  const span = Math.max(1, Math.ceil(radiusCm / CELL_SIZE_CM));
  const seen = new Set<number>();
  let best: SnapPoint | null = null;
  let bestDist = radiusCm;

  for (let ix = cx - span; ix <= cx + span; ix++) {
    for (let iy = cy - span; iy <= cy + span; iy++) {
      const bucket = index.cellBuckets.get(cellKey(ix, iy));
      if (!bucket) continue;
      for (const segIdx of bucket) {
        if (seen.has(segIdx)) continue;
        seen.add(segIdx);
        const { a, b } = index.worldSegments[segIdx];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;
        let t = ((worldPt.x - a.x) * dx + (worldPt.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + t * dx, y: a.y + t * dy };
        const d = dist(proj, worldPt);
        if (d < bestDist) {
          bestDist = d;
          best = { point: proj, kind: "midpoint" };
        }
      }
    }
  }
  return best;
}

/** İki doğru parçasının (segment) kesişim noktası, varsa. */
function segmentIntersection(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // paralel
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

function intersectionCandidates(variant: FloorVariantData): SnapPoint[] {
  const walls = Object.values(variant.walls);
  const out: SnapPoint[] = [];
  for (let i = 0; i < walls.length; i++) {
    const a1 = variant.corners[walls[i].a];
    const b1 = variant.corners[walls[i].b];
    if (!a1 || !b1) continue;
    for (let j = i + 1; j < walls.length; j++) {
      // Ortak köşeleri olan duvarlar zaten o köşede birleşir — ayrıca kesişim
      // noktası olarak işaretlemeye gerek yok.
      if (walls[i].a === walls[j].a || walls[i].a === walls[j].b || walls[i].b === walls[j].a || walls[i].b === walls[j].b) {
        continue;
      }
      const a2 = variant.corners[walls[j].a];
      const b2 = variant.corners[walls[j].b];
      if (!a2 || !b2) continue;
      const ix = segmentIntersection(a1, b1, a2, b2);
      if (ix) out.push({ point: ix, kind: "intersection" });
    }
  }
  return out;
}

function snapToGridPoint(p: Pt, stepCm: number): Pt {
  return { x: Math.round(p.x / stepCm) * stepCm, y: Math.round(p.y / stepCm) * stepCm };
}

/**
 * Verilen dünya noktasını en yakın snap adayına yapıştırır: köşe > kesişim > orta nokta
 * > (etkinse) ızgara noktası. Hiçbiri menzilde değilse nokta olduğu gibi döner.
 */
export function resolveSnapPoint(worldPt: Pt, variant: FloorVariantData, opts: SnapOptions): SnapPoint {
  if (!opts.snapEnabled) {
    if (opts.gridSnapEnabled) {
      return { point: snapToGridPoint(worldPt, opts.gridStepCm), kind: "grid" };
    }
    return { point: worldPt, kind: "guide" };
  }

  const radiusCm = (opts.snapRadiusPx ?? DEFAULT_SNAP_RADIUS_PX) / opts.pxPerCm;
  const priority: Record<SnapKind, number> = { corner: 0, intersection: 1, midpoint: 2, grid: 3, guide: 4, angle: 4 };

  const traceEdge = traceEdgeCandidate(variant, worldPt, radiusCm);
  const candidates = [...pointCandidates(variant), ...intersectionCandidates(variant), ...(traceEdge ? [traceEdge] : [])];
  let best: SnapPoint | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = dist(c.point, worldPt);
    if (d > radiusCm) continue;
    const score = d + priority[c.kind] * 0.01; // aynı mesafede öncelik sırasına göre ayır
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best) return best;

  if (opts.gridSnapEnabled) {
    const grid = snapToGridPoint(worldPt, opts.gridStepCm);
    if (dist(grid, worldPt) <= radiusCm) return { point: grid, kind: "grid" };
  }

  return { point: worldPt, kind: "guide" };
}

/**
 * Akıllı hizalama (§ smart guide): çizim sırasında imleci, mevcut köşelerle aynı
 * X/Y eksenine veya çapa noktasından 0/45/90° gibi açılara manyetik olarak çeker;
 * çekilen her eksen için ekranı kaplayan bir kılavuz çizgisi üretir.
 */
export function computeSmartGuides(
  rawPoint: Pt,
  variant: FloorVariantData,
  opts: SnapOptions
): { point: Pt; guides: GuideLine[]; angleDeg: number | null; lengthCm: number | null } {
  const guideRadiusCm = (opts.guideRadiusPx ?? DEFAULT_GUIDE_RADIUS_PX) / opts.pxPerCm;
  const extent = opts.guideExtentCm ?? 100000;
  let point = { ...rawPoint };
  const guides: GuideLine[] = [];

  const refPoints =
    opts.referencePoints ?? [...Object.values(variant.corners).map((c) => ({ x: c.x, y: c.y })), ...traceCornerWorldPoints(variant)];

  // Yatay/dikey hizalama: diğer köşelerle aynı X veya Y eksenine manyetik çekim.
  let bestVertical: { x: number; d: number } | null = null;
  let bestHorizontal: { y: number; d: number } | null = null;
  for (const p of refPoints) {
    const dx = Math.abs(p.x - rawPoint.x);
    if (dx <= guideRadiusCm && (!bestVertical || dx < bestVertical.d)) bestVertical = { x: p.x, d: dx };
    const dy = Math.abs(p.y - rawPoint.y);
    if (dy <= guideRadiusCm && (!bestHorizontal || dy < bestHorizontal.d)) bestHorizontal = { y: p.y, d: dy };
  }
  if (bestVertical) {
    point.x = bestVertical.x;
    guides.push({ a: { x: bestVertical.x, y: -extent }, b: { x: bestVertical.x, y: extent }, kind: "vertical" });
  }
  if (bestHorizontal) {
    point.y = bestHorizontal.y;
    guides.push({ a: { x: -extent, y: bestHorizontal.y }, b: { x: extent, y: bestHorizontal.y }, kind: "horizontal" });
  }

  // Açı kilidi: çapa noktası varsa 0/45/90/135° gibi artışlara kilitle + açı etiketi göster.
  let angleDeg: number | null = null;
  let lengthCm: number | null = null;
  if (opts.anchor) {
    const anchor = opts.anchor;
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1e-6) {
      const rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const incRad = (ANGLE_STEP_DEG * Math.PI) / 180;
      const angleRad = Math.atan2(dy, dx);
      const nearestRad = Math.round(angleRad / incRad) * incRad;
      const diffDeg = Math.abs((((angleRad - nearestRad) * 180) / Math.PI + 540) % 360) - 180;
      if (!bestVertical && !bestHorizontal && Math.abs(diffDeg) <= ANGLE_THRESHOLD_DEG) {
        point = { x: anchor.x + Math.cos(nearestRad) * distance, y: anchor.y + Math.sin(nearestRad) * distance };
        angleDeg = Math.round((nearestRad * 180) / Math.PI);
        guides.push({
          a: anchor,
          b: { x: anchor.x + Math.cos(nearestRad) * extent, y: anchor.y + Math.sin(nearestRad) * extent },
          kind: "angle",
          label: `${((angleDeg % 360) + 360) % 360}°`,
        });
      } else {
        angleDeg = Math.round(rawAngle);
      }
      lengthCm = Math.round(dist(anchor, point));
    }
  }

  return { point, guides, angleDeg, lengthCm };
}
