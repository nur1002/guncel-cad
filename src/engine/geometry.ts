// Saf geometri yardımcıları. Her şey cm cinsinden dünya koordinatlarında çalışır;
// ekran pikseline dönüşüm CanvasEditor içindeki px_per_cm / pan faktörüyle yapılır (§4).

export interface Pt {
  x: number;
  y: number;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Shoelace formülü — cm² cinsinden poligon alanı (mutlak değer). */
export function polygonAreaCm2(points: Pt[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

export function cm2ToM2(cm2: number): number {
  return cm2 / 10000;
}

export function polygonCentroid(points: Pt[]): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const cross = p1.x * p2.y - p2.x * p1.y;
    area += cross;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }
  area = area / 2;
  if (Math.abs(area) < 1e-6) {
    // dejenere poligon: basit ortalama
    const n = points.length;
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { x: cx, y: cy };
}

/** Bir duvar segmentine dik birim vektör (kalınlık offseti ve ölçü çizgisi için). */
export function perpendicular(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** Bir noktanın segment üzerine izdüşümü; t: 0..1 arası segment üzerindeki konum. */
export function projectPointToSegment(p: Pt, a: Pt, b: Pt): { point: Pt; t: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, distance: dist(p, point) };
}

export function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Bir noktayı, çapa noktasına göre en yakın açı artışına (varsayılan 45°) kilitler —
 * yamuk çizilen duvarları otomatik olarak yatay/dikey/diyagonal hale getirir.
 * Açı farkı eşik değerini aşarsa nokta olduğu gibi döner (serbest açı korunur).
 */
export function snapToOrtho(anchor: Pt, point: Pt, incrementDeg = 45, thresholdDeg = 6): Pt {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return point;
  const angle = Math.atan2(dy, dx);
  const incRad = (incrementDeg * Math.PI) / 180;
  const nearest = Math.round(angle / incRad) * incRad;
  const diff = Math.abs(Math.atan2(Math.sin(angle - nearest), Math.cos(angle - nearest)));
  if (diff <= (thresholdDeg * Math.PI) / 180) {
    return { x: anchor.x + Math.cos(nearest) * distance, y: anchor.y + Math.sin(nearest) * distance };
  }
  return point;
}

/** Bir noktanın, merkezi/genişliği/derinliği/döndürmesi verilen bir dikdörtgenin içinde olup olmadığını test eder. */
export function pointInRotatedRect(
  p: Pt,
  center: Pt,
  width: number,
  depth: number,
  rotationDeg: number
): boolean {
  const rad = (-rotationDeg * Math.PI) / 180;
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= depth / 2;
}

/** Bir noktayı belirtilen ızgara adımına (varsayılan 10 cm) yuvarlar (§4.1). */
export function snapToGrid(p: Pt, stepCm = 10): Pt {
  return { x: Math.round(p.x / stepCm) * stepCm, y: Math.round(p.y / stepCm) * stepCm };
}

/** Ray-casting point-in-polygon testi. */
export function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersect =
      pi.y > p.y !== pj.y > p.y && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

