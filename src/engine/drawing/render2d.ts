// Saf 2D canvas çizim fonksiyonları. Hiçbiri state tutmaz; CanvasEditor bu
// fonksiyonları her frame'de mevcut veriyle çağırır (§4).

import type { Corner, FloorVariantData, PlacedComponent, Room, VectorTrace, Wall } from "../../data/model";
import type { RoomTypeConfig } from "../../data/roomTypes";
import { COLOR_BLUEPRINT, COLOR_CANVAS_BG, COLOR_GRID, COLOR_GRID_MAJOR, COLOR_INK, COLOR_ORIGIN_AXIS, COLOR_REF_BAND, COLOR_RUST } from "../../styles/theme";
import { applyTransform, cm2ToM2, dist, perpendicular, polygonAreaCm2, polygonCentroid, type Pt } from "./geometry";

export interface View2D {
  pxPerCm: number;
  pan: Pt;
  width: number;
  height: number;
}

export function worldToScreen(view: View2D, p: Pt): Pt {
  return { x: view.pan.x + p.x * view.pxPerCm, y: view.pan.y + p.y * view.pxPerCm };
}

export function screenToWorld(view: View2D, p: Pt): Pt {
  return { x: (p.x - view.pan.x) / view.pxPerCm, y: (p.y - view.pan.y) / view.pxPerCm };
}

export function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  img: CanvasImageSource,
  xCm: number,
  yCm: number,
  widthCm: number,
  heightCm: number,
  opacity: number
) {
  const topLeft = worldToScreen(view, { x: xCm, y: yCm });
  const w = widthCm * view.pxPerCm;
  const h = heightCm * view.pxPerCm;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, topLeft.x, topLeft.y, w, h);
  ctx.restore();
}

/**
 * DWG/DXF içe aktarımından gelen ham kroki: yalnızca ince referans çizgileri —
 * köşe numarası/dolgu/duvar YOKTUR (§ "otomatik tanıma yapmasın, dosyayı olduğu
 * gibi açsın"). `x,y,rotationDeg,scale` ile yerleştirme dönüşümü canvas transform'u
 * (translate+rotate+scale) ile uygulanır — her nokta için ayrı ayrı hesap yapmaz,
 * bu yüzden binlerce segment olsa bile hızlıdır. `locked=false` iken (henüz "Parsele
 * Yerleştir" onaylanmamış) kesikli bir bbox çerçevesi + döndürme kolu gösterilir.
 */
export function drawVectorTrace(ctx: CanvasRenderingContext2D, view: View2D, trace: VectorTrace, selected: boolean) {
  if (!trace.visible || trace.segments.length === 0) return;
  const originScreen = worldToScreen(view, { x: trace.x, y: trace.y });
  const s = trace.scale * view.pxPerCm;

  // Group segments by category
  const structural: typeof trace.segments = [];
  const hatchSolid: typeof trace.segments = [];
  const helperBg: typeof trace.segments = [];

  for (const seg of trace.segments) {
    if (seg.type === "HATCH" || seg.type === "SOLID") {
      hatchSolid.push(seg);
    } else if (seg.type === "IMAGE" || seg.type === "WIPEOUT" || seg.type === "UNDERLAY") {
      helperBg.push(seg);
    } else {
      structural.push(seg);
    }
  }

  ctx.save();
  ctx.globalAlpha = trace.opacity;
  ctx.translate(originScreen.x, originScreen.y);
  ctx.rotate((trace.rotationDeg * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.lineWidth = 1 / s;

  const renderGroup = (segs: typeof trace.segments, color: string, dash?: number[]) => {
    if (segs.length === 0) return;
    ctx.save();
    ctx.strokeStyle = color;
    if (dash) {
      ctx.setLineDash(dash.map((v) => v / s));
    }
    ctx.beginPath();
    for (const seg of segs) {
      ctx.moveTo(seg.a.x, seg.a.y);
      ctx.lineTo(seg.b.x, seg.b.y);
    }
    ctx.stroke();
    ctx.restore();
  };

  // 1. Helper/Bg group (dashed, very light gray)
  renderGroup(helperBg, "rgba(148, 163, 184, 0.25)", [4, 4]);

  // 2. Hatch/Solid group (solid, light slate)
  renderGroup(hatchSolid, "rgba(148, 163, 184, 0.45)");

  // 3. Structural group (default blue or locked slate)
  const defaultColor = trace.locked ? "#475569" : "#2563EB";
  renderGroup(structural, defaultColor);

  ctx.restore();

  if (!trace.locked) {
    // Tek kaynak dönüşüm (applyTransform) — bkz. geometry.ts: render, snap ve
    // döndürme kolu hit-test'i AYNI matematiği kullanır, aralarında sapma olmaz.
    const halfW = trace.widthCm / 2;
    const halfH = trace.heightCm / 2;
    const corner = (lx: number, ly: number) => worldToScreen(view, applyTransform({ x: lx, y: ly }, trace));
    const c1 = corner(-halfW, -halfH);
    const c2 = corner(halfW, -halfH);
    const c3 = corner(halfW, halfH);
    const c4 = corner(-halfW, halfH);

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = selected ? COLOR_RUST : "#2563EB";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    [c1, c2, c3, c4].forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Döndürme kolu: üst kenarın ortasından dışarı doğru bir tutamaç. 30px'lik ekran
    // boşluğu sabit kalsın diye yerel ofset trace.scale'e bölünür (applyTransform
    // içeride zaten scale ile çarpacak).
    const handleGapLocal = 30 / (view.pxPerCm * (trace.scale || 1));
    const handleLocal = corner(0, -halfH - handleGapLocal);
    const topMid = corner(0, -halfH);
    ctx.save();
    ctx.strokeStyle = "#2563EB";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(topMid.x, topMid.y);
    ctx.lineTo(handleLocal.x, handleLocal.y);
    ctx.stroke();
    ctx.fillStyle = "#2563EB";
    ctx.beginPath();
    ctx.arc(handleLocal.x, handleLocal.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawParselBoundary(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  parsel: { widthCm: number; lengthCm: number; areaM2: number }
) {
  const p0 = worldToScreen(view, { x: 0, y: 0 });
  const p1 = worldToScreen(view, { x: parsel.widthCm, y: parsel.lengthCm });

  ctx.save();
  ctx.strokeStyle = "#16A34A";
  ctx.lineWidth = Math.max(2, 2.5 * view.pxPerCm);
  ctx.setLineDash([8, 6]);

  const w = p1.x - p0.x;
  const h = p1.y - p0.y;

  ctx.strokeRect(p0.x, p0.y, w, h);

  ctx.fillStyle = "#F0FDF41A";
  ctx.fillRect(p0.x, p0.y, w, h);

  ctx.setLineDash([]);
  ctx.fillStyle = "#16A34A";
  ctx.beginPath();
  ctx.arc(p0.x, p0.y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillText("📍 Parsel Origin (0,0)", p0.x + 10, p0.y + 16);
  ctx.fillText(`🌾 Parsel Sınırı (${parsel.areaM2} m²)`, p0.x + 10, p0.y - 8);

  ctx.restore();
}

const TARGET_STEP_PX = 70;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  options: { visible?: boolean; baseStepCm?: number } = {}
) {
  ctx.fillStyle = COLOR_CANVAS_BG;
  ctx.fillRect(0, 0, view.width, view.height);

  if (options.visible === false) return;

  // Zoom'a göre dinamik olarak küçülüp büyüyen iki katmanlı ızgara: ince alt çizgiler +
  // her 5 adımda bir kalın ana çizgi (sonsuz tuval hissini pekiştirir).
  let stepCm = options.baseStepCm ?? 100;
  while (stepCm * view.pxPerCm < TARGET_STEP_PX / 5) stepCm *= 5;
  while (stepCm * view.pxPerCm > TARGET_STEP_PX * 5) stepCm /= 5;
  const stepPx = stepCm * view.pxPerCm;
  if (stepPx < 4) return;

  const origin = worldToScreen(view, { x: 0, y: 0 });

  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let ix = 0;
  for (let x = origin.x % stepPx; x < view.width; x += stepPx, ix++) {
    if (ix % 5 === 0) continue; // ana çizgiler ayrı, daha koyu çizilecek
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
  }
  let iy = 0;
  for (let y = origin.y % stepPx; y < view.height; y += stepPx, iy++) {
    if (iy % 5 === 0) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
  }
  ctx.stroke();

  if (stepPx >= TARGET_STEP_PX * 0.9) {
    ctx.strokeStyle = COLOR_GRID_MAJOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ix = 0;
    for (let x = origin.x % stepPx; x < view.width; x += stepPx, ix++) {
      if (ix % 5 !== 0) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, view.height);
    }
    iy = 0;
    for (let y = origin.y % stepPx; y < view.height; y += stepPx, iy++) {
      if (iy % 5 !== 0) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(view.width, y);
    }
    ctx.stroke();
  }

  // Dünya orijini (0,0) her zaman belirgin bir çizgi çifti ile işaretlenir — sonsuz
  // tuvalde konum referansı verir.
  if (origin.x > -20 && origin.x < view.width + 20) {
    ctx.strokeStyle = COLOR_ORIGIN_AXIS;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, view.height);
    ctx.stroke();
  }
  if (origin.y > -20 && origin.y < view.height + 20) {
    ctx.strokeStyle = COLOR_ORIGIN_AXIS;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(view.width, origin.y);
    ctx.stroke();
  }
}

const SNAP_COLORS: Record<string, string> = {
  corner: "#C1652F",
  midpoint: "#2F6690",
  intersection: "#7A4FB5",
  grid: "#8a9298",
  guide: "#2F6690",
  angle: "#2F6690",
};

/** Aktif snap noktasını türüne göre farklı bir simgeyle işaretler (§ Snap sistemi). */
export function drawSnapIndicator(ctx: CanvasRenderingContext2D, view: View2D, point: Pt, kind: string) {
  const s = worldToScreen(view, point);
  const color = SNAP_COLORS[kind] ?? COLOR_RUST;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  if (kind === "corner") {
    // Kare
    const r = 6;
    ctx.strokeRect(s.x - r, s.y - r, r * 2, r * 2);
  } else if (kind === "midpoint") {
    // Üçgen
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - r);
    ctx.lineTo(s.x + r, s.y + r);
    ctx.lineTo(s.x - r, s.y + r);
    ctx.closePath();
    ctx.stroke();
  } else if (kind === "intersection") {
    // X işareti
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(s.x - r, s.y - r);
    ctx.lineTo(s.x + r, s.y + r);
    ctx.moveTo(s.x + r, s.y - r);
    ctx.lineTo(s.x - r, s.y + r);
    ctx.stroke();
  } else if (kind === "grid") {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export interface GuideLineLike {
  a: Pt;
  b: Pt;
  kind: string;
  label?: string;
}

/** Akıllı hizalama kılavuzları: paralel/dik/aynı-eksen çizgileri + açı etiketi (§ Smart Guide). */
export function drawSmartGuides(ctx: CanvasRenderingContext2D, view: View2D, guides: GuideLineLike[]) {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = COLOR_RUST;
  ctx.lineWidth = 1;
  for (const g of guides) {
    const a = worldToScreen(view, g.a);
    const b = worldToScreen(view, g.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (g.label) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.setLineDash([]);
      ctx.font = "600 10px 'IBM Plex Mono', monospace";
      const w = ctx.measureText(g.label).width + 8;
      ctx.fillStyle = "#C1652FE8";
      ctx.fillRect(mid.x - w / 2, mid.y - 9, w, 16);
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(g.label, mid.x, mid.y - 1);
      ctx.setLineDash([5, 4]);
    }
  }
  ctx.restore();
}

export function roomPolygon(room: Room, corners: Record<string, Corner>): Pt[] {
  return room.cornerLoop.map((id) => corners[id]).filter(Boolean) as Pt[];
}

export function roomAreaM2(room: Room, corners: Record<string, Corner>): number {
  return cm2ToM2(polygonAreaCm2(roomPolygon(room, corners)));
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  room: Room,
  corners: Record<string, Corner>,
  roomType: RoomTypeConfig,
  selected: boolean
) {
  const worldPts = roomPolygon(room, corners);
  if (worldPts.length < 3) return;
  const screenPts = worldPts.map((p) => worldToScreen(view, p));

  ctx.beginPath();
  screenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = roomType.color + (selected ? "22" : "0D");
  ctx.fill();
  
  ctx.save();
  ctx.strokeStyle = selected ? COLOR_RUST : roomType.color + "66";
  ctx.lineWidth = selected ? 2 : 1;
  if (!selected) {
    ctx.setLineDash([4, 4]);
  }
  ctx.stroke();
  ctx.restore();

  const areaM2 = roomAreaM2(room, corners);
  const centroidWorld = polygonCentroid(worldPts);
  const centroid = worldToScreen(view, centroidWorld);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 13px 'IBM Plex Sans', sans-serif";
  ctx.fillStyle = COLOR_INK;
  ctx.fillText(room.name, centroid.x, centroid.y - 14);

  ctx.font = "12px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_BLUEPRINT;
  ctx.fillText(`H=${room.height}`, centroid.x, centroid.y + 2);

  ctx.fillStyle = COLOR_RUST;
  ctx.fillText(`S=${areaM2.toFixed(2)} m²`, centroid.x, centroid.y + 18);

  if (room.source === "auto-detected") {
    drawConfidenceBadge(ctx, { x: centroid.x, y: centroid.y + 36 }, room.confidence);
  }
}

export function wallQuad(a: Pt, b: Pt, thickness: number): Pt[] {
  const perp = perpendicular(a, b);
  const half = thickness / 2;
  const offset = { x: perp.x * half, y: perp.y * half };
  return [
    { x: a.x + offset.x, y: a.y + offset.y },
    { x: b.x + offset.x, y: b.y + offset.y },
    { x: b.x - offset.x, y: b.y - offset.y },
    { x: a.x - offset.x, y: a.y - offset.y },
  ];
}

/**
 * Duvar çizimi (§4): teknik çizim geleneğine uygun **çift çizgi** — duvar gövdesi
 * malzeme renginde açık tonda dolgulanır, iki kenarı ince koyu konturla çizilir.
 * (Önceden gövde masif koyu doldurulduğu için duvarlar aşırı kalın/blok görünüyordu.)
 *
 * `fillColor` duvar malzemesinden gelir; böylece sıva/tuğla/beton gibi malzemeler
 * planda birbirinden ayırt edilir.
 */
export function drawWall(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  wall: Wall,
  a: Corner,
  b: Corner,
  selected: boolean,
  hovered: boolean,
  fillColor = "#FFFFFF",
  isBalconyRailing = false,
  renderMode: 'thick' | 'centerline' | 'doubleline' = 'doubleline'
) {
  if (renderMode === 'centerline') {
    const sa = worldToScreen(view, a);
    const sb = worldToScreen(view, b);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    if (isBalconyRailing || wall.malzeme === "korkuluk") {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = selected ? COLOR_RUST : "#0284C7";
      ctx.lineWidth = selected ? 2 : 1.5;
    } else if (wall.source === "auto-detected") {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = COLOR_RUST;
      ctx.lineWidth = 1.5;
    } else {
      let color = "#1E293B";
      if (selected) color = "#C1652F";
      else if (hovered) color = "#2F6690";
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 2 : hovered ? 1.75 : 1.5;
    }
    ctx.stroke();
    ctx.restore();
    if (wall.source === "auto-detected") {
      const mid = worldToScreen(view, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      drawConfidenceBadge(ctx, mid, wall.confidence);
    }
    return;
  }
  const quad = wallQuad(a, b, wall.thickness).map((p) => worldToScreen(view, p));
  ctx.beginPath();
  quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();

  if (isBalconyRailing || wall.malzeme === "korkuluk") {
    ctx.fillStyle = "#E0F2FE88";
    ctx.fill();
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = selected ? COLOR_RUST : "#0284C7";
    ctx.lineWidth = selected ? 2.5 : 2;
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (renderMode === 'doubleline') {
    // AutoCAD tarzı içi boş çift çizgi: Seçildiğinde hafif turuncu dolgu, normalde şeffaf (arkayı kapatmaz)
    ctx.fillStyle = selected ? "rgba(193, 101, 47, 0.15)" : "transparent";
  } else {
    // Dolu kalın duvar görünümü
    ctx.fillStyle = selected ? "#C1652F33" : fillColor;
  }
  ctx.fill();

  if (wall.source === "auto-detected") {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = COLOR_RUST;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  } else {
    // İnce kontur: zoom'dan bağımsız sabit kalınlık, seçili/hover'da hafif kalınlaşır.
    ctx.strokeStyle = selected ? COLOR_RUST : hovered ? COLOR_BLUEPRINT : COLOR_INK;
    ctx.lineWidth = selected ? 1.8 : hovered ? 1.5 : 1;
    ctx.stroke();
  }

  if (wall.source === "auto-detected") {
    const mid = worldToScreen(view, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    drawConfidenceBadge(ctx, mid, wall.confidence);
  }
}

/** Poligon aracı önizlemesi (§4.5): tıklanan noktalar + imleçle kapanan taslak. */
export function drawPolygonDraft(ctx: CanvasRenderingContext2D, view: View2D, points: Pt[], cursor: Pt | null) {
  if (points.length === 0) return;
  const screen = points.map((p) => worldToScreen(view, p));

  ctx.save();
  if (points.length >= 2) {
    ctx.beginPath();
    screen.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (cursor) {
      const c = worldToScreen(view, cursor);
      ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
    ctx.fillStyle = "#2F669018";
    ctx.fill();
  }

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = COLOR_BLUEPRINT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  screen.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (cursor) {
    const c = worldToScreen(view, cursor);
    ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
  ctx.restore();

  screen.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? COLOR_RUST : COLOR_BLUEPRINT;
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === 0 ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
  });

  if (points.length >= 3) {
    const areaM2 = cm2ToM2(polygonAreaCm2(cursor ? [...points, cursor] : points));
    const centroid = worldToScreen(view, polygonCentroid(cursor ? [...points, cursor] : points));
    ctx.font = "600 13px 'IBM Plex Mono', monospace";
    ctx.fillStyle = COLOR_RUST;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${areaM2.toFixed(2)} m²`, centroid.x, centroid.y);
  }
}

/** Döndürülmüş dikdörtgen önizlemesi (§4.5): taban kenarı + derinlik. */
export function drawRotatedRectDraft(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  a: Pt,
  b: Pt,
  depthCm: number
) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = COLOR_BLUEPRINT;
  ctx.lineWidth = 2;

  if (len < 1 || depthCm === 0) {
    // Sadece taban kenarı çizilmiş durumda
    const sa = worldToScreen(view, a);
    const sb = worldToScreen(view, b);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const px = -uy;
  const py = ux;
  const pts = [
    a,
    b,
    { x: b.x + px * depthCm, y: b.y + py * depthCm },
    { x: a.x + px * depthCm, y: a.y + py * depthCm },
  ].map((p) => worldToScreen(view, p));

  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = "#2F669022";
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const areaM2 = cm2ToM2(len * Math.abs(depthCm));
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 13px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_RUST;
  ctx.fillText(`${areaM2.toFixed(2)} m²`, cx, cy);
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_BLUEPRINT;
  ctx.fillText(`${Math.round(len)} × ${Math.round(Math.abs(depthCm))} cm`, cx, cy + 18);
}

function drawConfidenceBadge(ctx: CanvasRenderingContext2D, at: Pt, confidence?: number) {
  const pct = Math.round((confidence ?? 0) * 100);
  ctx.font = "600 10px 'IBM Plex Mono', monospace";
  const text = `%${pct}`;
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = "#C1652FE0";
  ctx.fillRect(at.x - w / 2, at.y - 8, w, 16);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, at.x, at.y);
}

export function drawDimension(ctx: CanvasRenderingContext2D, view: View2D, a: Pt, b: Pt) {
  const lengthCm = dist(a, b);
  if (lengthCm < 1) return;
  const perp = perpendicular(a, b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const offsetCm = 18 / view.pxPerCm;
  const labelWorld = { x: mid.x + perp.x * offsetCm, y: mid.y + perp.y * offsetCm };
  const label = worldToScreen(view, labelWorld);

  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const flip = angle > Math.PI / 2 || angle < -Math.PI / 2;

  ctx.save();
  ctx.translate(label.x, label.y);
  ctx.rotate(flip ? angle + Math.PI : angle);
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_BLUEPRINT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(lengthCm)} cm`, 0, 0);
  ctx.restore();
}

export function drawCornerHandle(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  corner: Corner,
  selected: boolean,
  hovered: boolean,
  indexLabel?: number
) {
  const p = worldToScreen(view, corner);
  const size = selected || hovered ? 9 : 7;
  // bilCAD'deki gibi sarı dolgulu düğüm noktası (§4.7)
  ctx.fillStyle = selected ? COLOR_RUST : hovered ? COLOR_BLUEPRINT : "#E8C547";
  ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);

  if (indexLabel !== undefined && view.pxPerCm > 0.25) {
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = COLOR_INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(indexLabel), p.x + size / 2 + 2, p.y - size / 2);
  }
}

export function drawComponent(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  comp: PlacedComponent,
  a: Corner,
  b: Corner,
  wallThickness: number,
  widthCm: number,
  offsetCm: number,
  selected: boolean
) {
  const wallLen = dist(a, b);
  if (wallLen < 1) return;
  const dirX = (b.x - a.x) / wallLen;
  const dirY = (b.y - a.y) / wallLen;
  const centerCm = offsetCm;
  const halfW = widthCm / 2;
  const p1 = { x: a.x + dirX * (centerCm - halfW), y: a.y + dirY * (centerCm - halfW) };
  const p2 = { x: a.x + dirX * (centerCm + halfW), y: a.y + dirY * (centerCm + halfW) };
  const quad = wallQuad(p1, p2, wallThickness).map((p) => worldToScreen(view, p));

  const isDoor = comp.tip === "kapi";
  ctx.beginPath();
  quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = COLOR_CANVAS_BG;
  ctx.fill();
  ctx.strokeStyle = selected ? COLOR_RUST : isDoor ? COLOR_RUST : COLOR_BLUEPRINT;
  ctx.lineWidth = selected ? 3 : 2;
  ctx.stroke();

  if (isDoor) {
    // kapı kanadı + açılış yayı (basit gösterim)
    const hinge = worldToScreen(view, p1);
    const swingEnd = worldToScreen(view, { x: p1.x - dirY * widthCm, y: p1.y + dirX * widthCm });
    ctx.beginPath();
    ctx.moveTo(hinge.x, hinge.y);
    ctx.lineTo(swingEnd.x, swingEnd.y);
    ctx.strokeStyle = COLOR_RUST;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (comp.source === "auto-detected") {
    const midWorld = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    drawConfidenceBadge(ctx, worldToScreen(view, midWorld), comp.confidence);
  }
}

export function drawFloorComponent(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  comp: PlacedComponent,
  center: Pt,
  rotationDeg: number,
  widthCm: number,
  depthCm: number,
  selected: boolean
) {
  const c = worldToScreen(view, center);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  const w = widthCm * view.pxPerCm;
  const d = depthCm * view.pxPerCm;
  ctx.fillStyle = selected ? "#C1652F33" : "#2F669022";
  ctx.strokeStyle = selected ? COLOR_RUST : COLOR_BLUEPRINT;
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.rect(-w / 2, -d / 2, w, d);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.font = "11px 'IBM Plex Sans', sans-serif";
  ctx.fillStyle = COLOR_INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(comp.altTip, c.x, c.y);

  if (comp.source === "auto-detected") {
    drawConfidenceBadge(ctx, { x: c.x, y: c.y - d / 2 - 8 }, comp.confidence);
  }
}

/**
 * Mimari referans kadranı (§4.7): planın dört kenarında harf (A,B,C…) ve rakam (1,2,3…)
 * etiketleri. Teknik paftalardaki gibi "D-6 hizası" şeklinde sözlü referans vermeyi sağlar.
 */
export function drawReferenceGrid(ctx: CanvasRenderingContext2D, view: View2D, stepCm = 200) {
  const BAND = 18; // kadran şerit kalınlığı (px)
  const stepPx = stepCm * view.pxPerCm;
  if (stepPx < 26) return; // çok sıkışıksa etiket basma

  ctx.save();
  ctx.fillStyle = COLOR_REF_BAND;
  ctx.fillRect(0, 0, view.width, BAND);
  ctx.fillRect(0, view.height - BAND, view.width, BAND);
  ctx.fillRect(0, 0, BAND, view.height);
  ctx.fillRect(view.width - BAND, 0, BAND, view.height);

  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.strokeRect(BAND, BAND, view.width - BAND * 2, view.height - BAND * 2);

  ctx.font = "600 10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const letter = (i: number) => {
    // A..Z, sonra AA, AB…
    let n = i;
    let s = "";
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
  };

  // Üst/alt: harf etiketleri (X ekseni)
  const firstIx = Math.floor((-view.pan.x / view.pxPerCm) / stepCm);
  for (let i = firstIx; ; i++) {
    const worldX = i * stepCm;
    const sx = worldToScreen(view, { x: worldX, y: 0 }).x;
    if (sx > view.width) break;
    if (sx < BAND) continue;
    const label = letter(((i % 260) + 260) % 260);
    ctx.fillText(label, sx, BAND / 2);
    ctx.fillText(label, sx, view.height - BAND / 2);
  }

  // Sol/sağ: rakam etiketleri (Y ekseni)
  const firstIy = Math.floor((-view.pan.y / view.pxPerCm) / stepCm);
  for (let i = firstIy; ; i++) {
    const worldY = i * stepCm;
    const sy = worldToScreen(view, { x: 0, y: worldY }).y;
    if (sy > view.height) break;
    if (sy < BAND) continue;
    const label = String(i + 1);
    ctx.fillText(label, BAND / 2, sy);
    ctx.fillText(label, view.width - BAND / 2, sy);
  }
  ctx.restore();
}

/** Kement (marquee) seçim kutusu önizlemesi (§4.2). */
export function drawMarquee(ctx: CanvasRenderingContext2D, view: View2D, p0: Pt, p1: Pt) {
  const a = worldToScreen(view, p0);
  const b = worldToScreen(view, p1);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  ctx.save();
  ctx.fillStyle = "#2F669018";
  ctx.fillRect(x, y, w, h);
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = COLOR_BLUEPRINT;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/** Hızlı Oda aracı önizlemesi (§4.1): canlı dikdörtgen + m² etiketi. */
export function drawRoomDraft(ctx: CanvasRenderingContext2D, view: View2D, p0: Pt, p1: Pt) {
  const minX = Math.min(p0.x, p1.x);
  const maxX = Math.max(p0.x, p1.x);
  const minY = Math.min(p0.y, p1.y);
  const maxY = Math.max(p0.y, p1.y);
  const tl = worldToScreen(view, { x: minX, y: minY });
  const br = worldToScreen(view, { x: maxX, y: maxY });
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  ctx.save();
  ctx.fillStyle = "#2F669022";
  ctx.fillRect(tl.x, tl.y, w, h);
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = COLOR_BLUEPRINT;
  ctx.lineWidth = 2;
  ctx.strokeRect(tl.x, tl.y, w, h);
  ctx.restore();

  const widthCm = maxX - minX;
  const depthCm = maxY - minY;
  const areaM2 = cm2ToM2(widthCm * depthCm);

  const cx = tl.x + w / 2;
  const cy = tl.y + h / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 13px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_RUST;
  ctx.fillText(`${areaM2.toFixed(2)} m²`, cx, cy);
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_BLUEPRINT;
  ctx.fillText(`${Math.round(widthCm)} × ${Math.round(depthCm)} cm`, cx, cy + 18);
}

/**
 * "Oda" aracının varsayılan tık-tık-tık serbest çokgen modu için canlı önizleme:
 * şimdiye kadar yerleştirilen köşeler + imlecin anlık konumuyla oluşan alan, henüz
 * döngü kapanmadan (son duvar bırakılmadan) seçili oda tipinin rengiyle dolgulanır
 * (§13 "kapanmakta olan alanın canlı renklenmesi").
 */
export function drawRoomChainPreview(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  points: Pt[],
  cursor: Pt | null,
  fillColor: string
) {
  if (points.length === 0) return;
  const allPts = cursor ? [...points, cursor] : points;

  if (allPts.length >= 3) {
    ctx.save();
    ctx.beginPath();
    allPts.forEach((p, i) => {
      const s = worldToScreen(view, p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.restore();

    const areaM2 = cm2ToM2(polygonAreaCm2(allPts));
    const centroid = worldToScreen(view, polygonCentroid(allPts));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 13px 'IBM Plex Mono', monospace";
    ctx.fillStyle = COLOR_RUST;
    ctx.fillText(`${areaM2.toFixed(2)} m²`, centroid.x, centroid.y);
  }

  ctx.save();
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = worldToScreen(view, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (cursor) {
    const s = worldToScreen(view, cursor);
    ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.restore();

  points.forEach((p, i) => {
    const s = worldToScreen(view, p);
    ctx.fillStyle = i === 0 ? "#22C55E" : "#3B82F6";
    ctx.beginPath();
    ctx.arc(s.x, s.y, i === 0 ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawDraftChain(ctx: CanvasRenderingContext2D, view: View2D, points: Pt[], cursor: Pt | null) {
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = worldToScreen(view, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (cursor) {
    const s = worldToScreen(view, cursor);
    ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.restore();

  points.forEach((p) => {
    const s = worldToScreen(view, p);
    ctx.fillStyle = "#3B82F6";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawGhostWallPreview(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  anchor: {x:number, y:number},
  cursor: {x:number, y:number},
  thickness: number
) {
  // Duvarın kalınlığını hesapla ve ekran koordinatlarına dönüştür
  const quad = wallQuad(anchor, cursor, thickness).map((p) => worldToScreen(view, p));
  
  ctx.save();
  // 1) Transparan mavi dolgu (hayalet alan)
  ctx.beginPath();
  quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
  ctx.fill();
  
  // 2) Hayalet kontur (çift çizgi sınırları)
  ctx.strokeStyle = "rgba(59, 130, 246, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  
  // 3) Tek ince mavi aks/centerline çizgisi
  const sa = worldToScreen(view, anchor);
  const sc = worldToScreen(view, cursor);
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sc.x, sc.y);
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  ctx.restore();

  drawDimension(ctx, view, anchor, cursor);
}

export function drawMeasurePreview(ctx: CanvasRenderingContext2D, view: View2D, a: Pt, b: Pt) {
  drawDimension(ctx, view, a, b);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = COLOR_RUST;
  ctx.lineWidth = 1.5;
  const sa = worldToScreen(view, a);
  const sb = worldToScreen(view, b);
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.stroke();
  ctx.restore();
}

export function drawPlacementPreview(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  a: Pt,
  b: Pt,
  thickness: number,
  fromCm: number,
  toCm: number
) {
  const wallLen = dist(a, b);
  if (wallLen < 1) return;
  const dirX = (b.x - a.x) / wallLen;
  const dirY = (b.y - a.y) / wallLen;
  const lo = Math.min(fromCm, toCm);
  const hi = Math.max(fromCm, toCm);
  const p1 = { x: a.x + dirX * lo, y: a.y + dirY * lo };
  const p2 = { x: a.x + dirX * hi, y: a.y + dirY * hi };
  const quad = wallQuad(p1, p2, thickness).map((p) => worldToScreen(view, p));

  ctx.beginPath();
  quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = "#C1652F55";
  ctx.fill();
  ctx.strokeStyle = COLOR_RUST;
  ctx.lineWidth = 2;
  ctx.stroke();

  const mid = worldToScreen(view, { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
  ctx.font = "600 11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_RUST;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${Math.round(hi - lo)} cm`, mid.x, mid.y - 10);
}

export function drawTextAnnotations(ctx: CanvasRenderingContext2D, view: View2D, variant: FloorVariantData) {
  ctx.font = "13px 'IBM Plex Sans', sans-serif";
  ctx.fillStyle = COLOR_INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const ann of Object.values(variant.textAnnotations)) {
    const s = worldToScreen(view, ann);
    ctx.fillText(ann.text, s.x, s.y);
  }
}
