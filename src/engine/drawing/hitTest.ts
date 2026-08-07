// Saf hit-test yardımcıları: dünya koordinatında bir noktanın hangi nesneye
// isabet ettiğini bulur. CanvasEditor'daki pointer olaylarında kullanılır.

import type { FloorVariantData, ID } from "../../data/model";
import { dist, pointInPolygon, pointInRotatedRect, projectPointToSegment, type Pt } from "./geometry";
import type { View2D } from "./render2d";
import { worldToScreen } from "./render2d";

const CORNER_HIT_SCREEN_PX = 10;
const WALL_HIT_MARGIN_CM = 12;
const COMPONENT_HIT_MARGIN_CM = 15;

export function hitTestCorner(variant: FloorVariantData, view: View2D, worldPt: Pt): ID | null {
  const screenPt = worldToScreen(view, worldPt);
  for (const c of Object.values(variant.corners)) {
    const s = worldToScreen(view, c);
    if (dist(s, screenPt) <= CORNER_HIT_SCREEN_PX) return c.id;
  }
  return null;
}

export function hitTestComponent(variant: FloorVariantData, worldPt: Pt): ID | null {
  for (const comp of Object.values(variant.components)) {
    if (comp.konum.kind === "zemin") {
      const width = Number(comp.oznitelikler["genislik"] ?? 60);
      const depth = Number(comp.oznitelikler["derinlik"] ?? 60);
      if (pointInRotatedRect(worldPt, comp.konum, width, depth, comp.konum.rotationDeg)) {
        return comp.id;
      }
      continue;
    }
    const wall = variant.walls[comp.konum.duvarId];
    if (!wall) continue;
    const a = variant.corners[wall.a];
    const b = variant.corners[wall.b];
    if (!a || !b) continue;
    const proj = projectPointToSegment(worldPt, a, b);
    const wallLen = dist(a, b);
    const alongCm = proj.t * wallLen;
    const width = Number(comp.oznitelikler["genislik"] ?? 80);
    if (
      Math.abs(alongCm - comp.konum.offsetCm) <= width / 2 + 5 &&
      proj.distance <= wall.thickness / 2 + COMPONENT_HIT_MARGIN_CM
    ) {
      return comp.id;
    }
  }
  return null;
}

export function hitTestWall(variant: FloorVariantData, worldPt: Pt): ID | null {
  let best: ID | null = null;
  let bestDist = Infinity;
  for (const w of Object.values(variant.walls)) {
    const a = variant.corners[w.a];
    const b = variant.corners[w.b];
    if (!a || !b) continue;
    const proj = projectPointToSegment(worldPt, a, b);
    const tolerance = w.thickness / 2 + WALL_HIT_MARGIN_CM;
    if (proj.distance <= tolerance && proj.distance < bestDist) {
      best = w.id;
      bestDist = proj.distance;
    }
  }
  return best;
}

export function hitTestRoom(variant: FloorVariantData, worldPt: Pt): ID | null {
  for (const room of Object.values(variant.rooms)) {
    const poly = room.cornerLoop.map((id) => variant.corners[id]).filter(Boolean) as Pt[];
    if (poly.length >= 3 && pointInPolygon(worldPt, poly)) return room.id;
  }
  return null;
}
