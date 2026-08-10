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

/** İki doğru parçasının iç kesişim noktası (uçlarda değil, gövdede); kesişmiyorsa null. */
export function segmentIntersection(
  p1: Pt,
  p2: Pt,
  p3: Pt,
  p4: Pt
): { point: Pt; t: number; u: number } | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // paralel
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { point: { x: p1.x + t * d1x, y: p1.y + t * d1y }, t, u };
}

/**
 * Bir kenar (graf ayrıtı) kapalı bir döngünün parçası mı, yoksa "köprü" (hiçbir
 * döngüye ait olmayan, sarkan/bağlantısız bir çizgi) mi? Standart Tarjan köprü
 * bulma algoritması, YİNELEMELİ (özyinelemesiz) — büyük gerçek DWG/DXF dosyalarında
 * binlerce düğüm olabileceğinden çağrı yığını taşmasın diye özyineleme kullanılmaz.
 * DXF/DWG içe aktarımında "sadece kapalı alanları (odaları) tanı, mobilya/ölçü/
 * çizgi gibi tek başına duran parçaları duvar olarak ekleme" kuralını uygulamak için
 * kullanılır: köprü OLMAYAN kenarlar bir döngünün parçasıdır, yani gerçek bir oda
 * sınırı olabilir; köprüler ise atılır.
 */
export function findCycleEdges(adjacency: Map<string, Set<string>>): Set<string> {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const visited = new Set<string>();
  const cycleEdges = new Set<string>();
  let timer = 0;
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    type Frame = { node: string; parent: string | null; neighbors: string[]; idx: number };
    const stack: Frame[] = [];
    visited.add(start);
    disc.set(start, timer);
    low.set(start, timer);
    timer++;
    stack.push({ node: start, parent: null, neighbors: [...(adjacency.get(start) ?? [])], idx: 0 });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.idx < frame.neighbors.length) {
        const next = frame.neighbors[frame.idx];
        frame.idx++;
        if (next === frame.parent) continue;
        if (!visited.has(next)) {
          visited.add(next);
          disc.set(next, timer);
          low.set(next, timer);
          timer++;
          stack.push({ node: next, parent: frame.node, neighbors: [...(adjacency.get(next) ?? [])], idx: 0 });
        } else {
          low.set(frame.node, Math.min(low.get(frame.node)!, disc.get(next)!));
          cycleEdges.add(edgeKey(frame.node, next)); // geri-kenar her zaman bir döngünün parçasıdır
        }
      } else {
        stack.pop();
        const parentFrame = stack[stack.length - 1];
        if (parentFrame) {
          low.set(parentFrame.node, Math.min(low.get(parentFrame.node)!, low.get(frame.node)!));
          if (low.get(frame.node)! <= disc.get(parentFrame.node)!) {
            cycleEdges.add(edgeKey(parentFrame.node, frame.node));
          }
          // aksi halde bu bir köprüdür — cycleEdges'e eklenmez.
        }
      }
    }
  }
  return cycleEdges;
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

