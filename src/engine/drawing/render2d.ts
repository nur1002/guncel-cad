// Saf 2D canvas çizim fonksiyonları. Hiçbiri state tutmaz; CanvasEditor bu
// fonksiyonları her frame'de mevcut veriyle çağırır (§4).

import type { BagimsizBolum, BuildingOutline, Corner, FloorVariantData, PlacedComponent, Room, VectorTrace, Wall } from "../../data/model";
import type { RoomTypeConfig } from "../../data/roomTypes";
import { COLOR_BLUEPRINT, COLOR_GRID, COLOR_INK, COLOR_RUST } from "../../styles/theme";
import { cm2ToM2, dist, perpendicular, polygonAreaCm2, polygonCentroid, type Pt } from "./geometry";


/**
 * Malzemeye göre 45° taşıma (hatch) deseni — mimari kesit çizimi geleneği.
 * Pattern nesneleri context'e bağlı olduğu için (ve her frame yeniden üretmek
 * pahalı olduğu için) malzeme id'sine göre memoize edilir; yalnızca ilk
 * kullanımda küçük bir offscreen tuvalde çizilir.
 */


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

  ctx.save();
  ctx.globalAlpha = trace.opacity;
  ctx.translate(originScreen.x, originScreen.y);
  ctx.rotate((trace.rotationDeg * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.strokeStyle = trace.locked ? "#334155" : "#2563EB";
  ctx.lineWidth = 1 / s;
  ctx.beginPath();
  for (const seg of trace.segments) {
    ctx.moveTo(seg.a.x, seg.a.y);
    ctx.lineTo(seg.b.x, seg.b.y);
  }
  ctx.stroke();
  ctx.restore();

  if (!trace.locked) {
    const halfW = (trace.widthCm * trace.scale) / 2;
    const halfH = (trace.heightCm * trace.scale) / 2;
    const rad = (trace.rotationDeg * Math.PI) / 180;
    const corner = (lx: number, ly: number) => {
      const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
      const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
      return worldToScreen(view, { x: trace.x + rx, y: trace.y + ry });
    };
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

    // Döndürme kolu: üst kenarın ortasından dışarı doğru bir tutamaç.
    const handleLocal = corner(0, -halfH - 30 / view.pxPerCm);
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
  ctx.strokeStyle = "#16a34a"; // semantik yeşil
  ctx.lineWidth = 1.5; // ince kesikli çizgi
  ctx.setLineDash([8, 6]);

  const w = p1.x - p0.x;
  const h = p1.y - p0.y;

  ctx.strokeRect(p0.x, p0.y, w, h);

  ctx.fillStyle = "rgba(22, 163, 74, 0.05)"; // çok hafif yeşil şeffaf dolgu
  ctx.fillRect(p0.x, p0.y, w, h);

  ctx.setLineDash([]);
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.arc(p0.x, p0.y, 5, 0, Math.PI * 2);
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
  options: { visible?: boolean; baseStepCm?: number; showAxes?: boolean } = {}
) {
  ctx.fillStyle = "#FBFAF7";
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
    ctx.strokeStyle = "#D8DBDD";
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

  // Dünya orijini (0,0) her zaman belirgin bir çizgi çifti ile işaretlenir
  if (options.showAxes !== false) {
    if (origin.x > -20 && origin.x < view.width + 20) {
      ctx.strokeStyle = "#C7CBCD";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, view.height);
      ctx.stroke();
    }
    if (origin.y > -20 && origin.y < view.height + 20) {
      ctx.strokeStyle = "#C7CBCD";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(view.width, origin.y);
      ctx.stroke();
    }
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

export function roomPerimeterM(room: Room, corners: Record<string, Corner>): number {
  const pts = roomPolygon(room, corners);
  if (pts.length < 2) return 0;
  let sumCm = 0;
  for (let i = 0; i < pts.length; i++) {
    sumCm += dist(pts[i], pts[(i + 1) % pts.length]);
  }
  return sumCm / 100;
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  room: Room,
  corners: Record<string, Corner>,
  roomType: RoomTypeConfig,
  selected: boolean,
  showTag = true
) {
  const worldPts = roomPolygon(room, corners);
  if (worldPts.length < 3) return;
  const screenPts = worldPts.map((p) => worldToScreen(view, p));

  ctx.save();
  ctx.beginPath();
  screenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  // Eski bilCAD mantığına dönüş (§ 2026-08-11): oda tipinin rengiyle yarı saydam bir
  // dolgu — duvarlar bundan ETKİLENMEZ (drawWall ayrı, ince çizgi kalır). Bu dolgu,
  // çizim SIRASINDAKİ beyaz-siluet önizlemesinden (drawRoomChainPreview) tamamen ayrı;
  // burası SADECE tamamlanmış/kalıcı Room'lar için.
  ctx.fillStyle = roomType.color;
  ctx.globalAlpha = selected ? 0.5 : 0.32;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = selected ? COLOR_RUST : roomType.color;
  ctx.lineWidth = selected ? 2.2 : 1.2;
  ctx.stroke();
  ctx.restore();

  if (showTag) {
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
}

/**
 * Bağımsız Bölüm Sınırı (§ Wall/Room/BB semantik ayrımı): SADECE bir gösterge —
 * fiziksel bir Wall değildir, yeni bir Room da değildir, oda dolgusu gibi davranmaz
 * (dolgu YOK, krokiyi kapatmaz). Üye odaların köşelerini kapsayan basit bir eksene-hizalı
 * kutu + ince kesikli çizgi + BB kod etiketi çizer. Gerçek konkav bir çevre-poligonu
 * (hull) HESAPLAMAZ — bu, çok-odalı BB'ler için kabaca bir görsel gösterge olarak
 * yeterlidir; kesin geometri gerekiyorsa CityGML tarafında zaten Room'ların kendi
 * geometrisi kullanılıyor (bkz. cityGmlExport.ts), bu sadece editördeki bir etikettir.
 */
export function drawBagimsizBolumBoundary(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  bb: BagimsizBolum,
  rooms: Room[],
  corners: Record<string, Corner>
) {
  const pts: Pt[] = [];
  for (const room of rooms) {
    for (const p of roomPolygon(room, corners)) pts.push(p);
  }
  if (pts.length < 3) return;

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const PAD_CM = 15; // odaların dış duvarlarına çok yapışık görünmesin diye küçük bir boşluk
  const tl = worldToScreen(view, { x: minX - PAD_CM, y: minY - PAD_CM });
  const br = worldToScreen(view, { x: maxX + PAD_CM, y: maxY + PAD_CM });

  ctx.save();
  ctx.setLineDash([10, 6]);
  ctx.strokeStyle = COLOR_RUST;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.setLineDash([]);

  const label = `BB ${bb.kod}`;
  ctx.font = "700 11px 'IBM Plex Mono', monospace";
  const w = ctx.measureText(label).width + 10;
  ctx.fillStyle = COLOR_RUST;
  ctx.fillRect(tl.x, tl.y - 18, w, 16);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, tl.x + 5, tl.y - 10);
  ctx.restore();
}

/**
 * Bina Dış Sınırı (§ Wall/Room/BuildingOutline semantik ayrımı, 2026-08-11): Room DEĞİL,
 * Wall da DEĞİL — kalın, temiz bir dış hat çizgisi. Dolgu yok (oda dolgusuyla
 * karıştırılmasın), duvarların rengini/kalınlığını da kullanmaz — kendi sabit koyu
 * tonuyla, diğer her şeyden görsel olarak ayrışan tek bir çizgi.
 */
export function drawBuildingOutline(ctx: CanvasRenderingContext2D, view: View2D, outline: BuildingOutline, corners: Record<string, Corner>) {
  const pts = outline.cornerLoop.map((id) => corners[id]).filter(Boolean) as Pt[];
  if (pts.length < 3) return;
  const screenPts = pts.map((p) => worldToScreen(view, p));
  ctx.save();
  ctx.beginPath();
  screenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
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
 * Duvar çizimi.
 */
export function drawWall(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  wall: Wall,
  a: Corner,
  b: Corner,
  selected: boolean,
  hovered: boolean,
  _fillColor = "#FFFFFF",
  isBalconyRailing = false,
  renderMode: 'thick' | 'centerline' | 'doubleline' | 'hatch' = 'doubleline',
  rooms: Room[] = [],
  roomTypes: RoomTypeConfig[] = []
) {
  // Duvarın bir odaya ait olup olmadığını kontrol et
  const parentRoom = rooms.find((r) => r.wallLoop.includes(wall.id));
  const parentRoomType = parentRoom ? roomTypes.find((t) => t.id === parentRoom.typeId) : null;
  const roomColor = parentRoomType ? parentRoomType.color : null;

  const defaultStrokeColor = "#64748b"; // koyu gri ince CAD çizgileri
  const strokeColor = selected ? "#2563eb" : hovered ? "#3b82f6" : (roomColor ?? defaultStrokeColor);

  // Seçili duvar: İnce çizgi + hafif mavi highlight (glow)
  if (selected) {
    ctx.save();
    const sa = worldToScreen(view, a);
    const sb = worldToScreen(view, b);
    ctx.strokeStyle = "rgba(37, 99, 235, 0.15)";
    ctx.lineWidth = Math.max(8, wall.thickness * view.pxPerCm + 6);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.restore();
  }

  if (renderMode === 'centerline') {
    const sa = worldToScreen(view, a);
    const sb = worldToScreen(view, b);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    if (isBalconyRailing || wall.malzeme === "korkuluk") {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = selected ? 1.5 : hovered ? 1.25 : 1;
    } else if (wall.source === "auto-detected") {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = selected ? 1.5 : hovered ? 1.25 : 1;
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  const quad = wallQuad(a, b, wall.thickness).map((p) => worldToScreen(view, p));
  ctx.beginPath();
  quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();

  if (isBalconyRailing || wall.malzeme === "korkuluk") {
    ctx.fillStyle = "rgba(224, 242, 254, 0.4)";
    ctx.fill();
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = selected ? 1.5 : hovered ? 1.25 : 1;
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (renderMode === 'doubleline' || renderMode === 'hatch' || renderMode === 'thick') {
    // Çift çizgi aralığı (wall fill): oda rengi dolgusu değildir, hafif nötr grid arkası tonudur.
    ctx.fillStyle = "rgba(241, 245, 249, 0.75)";
    ctx.fill();
  }

  // İnce kontur çizgisi (1px normal, 1.25px hover, 1.5px selected)
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = selected ? 1.5 : hovered ? 1.25 : 1;
  ctx.stroke();

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

/**
 * Zincirlenmiş ölçü çizgisi (§ mimari ölçülendirme geleneği): oda çevresindeki
 * her kenar için uzantı çizgisi + tik işareti + uzunluk etiketi üretir. Kalıcı
 * bir model alanı GEREKTİRMEZ — her frame `roomPolygon`'dan canlı türetilir
 * (mevcut cetvel/grid çizim yaklaşımıyla aynı ruh, bkz. CanvasEditor rulers).
 */
export function drawRoomDimensionChain(ctx: CanvasRenderingContext2D, view: View2D, room: Room, corners: Record<string, Corner>) {
  const pts = roomPolygon(room, corners);
  if (pts.length < 3) return;
  const centroid = polygonCentroid(pts);
  const offsetCm = 26 / view.pxPerCm;
  const tickCm = 5 / view.pxPerCm;

  ctx.save();
  ctx.strokeStyle = COLOR_BLUEPRINT;
  ctx.lineWidth = 1;
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLOR_BLUEPRINT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const lengthCm = dist(p1, p2);
    if (lengthCm < 20) continue; // çok kısa kenarlarda etiket sığmaz, atla

    let perp = perpendicular(p1, p2);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    // perpendicular'ın yönü poligonun sarma yönüne bağlı — DIŞA doğru olduğundan
    // emin olmak için merkez-kenar vektörüyle karşılaştırılır.
    if ((mid.x - centroid.x) * perp.x + (mid.y - centroid.y) * perp.y < 0) {
      perp = { x: -perp.x, y: -perp.y };
    }

    const d1 = { x: p1.x + perp.x * offsetCm, y: p1.y + perp.y * offsetCm };
    const d2 = { x: p2.x + perp.x * offsetCm, y: p2.y + perp.y * offsetCm };
    const s1 = worldToScreen(view, p1);
    const s2 = worldToScreen(view, p2);
    const sd1 = worldToScreen(view, d1);
    const sd2 = worldToScreen(view, d2);

    // Uzantı çizgileri (duvardan ölçü çizgisine)
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(sd1.x, sd1.y);
    ctx.moveTo(s2.x, s2.y);
    ctx.lineTo(sd2.x, sd2.y);
    ctx.stroke();

    // Ölçü çizgisi
    ctx.beginPath();
    ctx.moveTo(sd1.x, sd1.y);
    ctx.lineTo(sd2.x, sd2.y);
    ctx.stroke();

    // Tik işaretleri (45° kısa çentikler, mimari ölçülendirme geleneği)
    const dirX = (d2.x - d1.x) / lengthCm;
    const dirY = (d2.y - d1.y) / lengthCm;
    for (const dPt of [d1, d2]) {
      const t1 = { x: dPt.x - (dirX + perp.x) * tickCm, y: dPt.y - (dirY + perp.y) * tickCm };
      const t2 = { x: dPt.x + (dirX + perp.x) * tickCm, y: dPt.y + (dirY + perp.y) * tickCm };
      const st1 = worldToScreen(view, t1);
      const st2 = worldToScreen(view, t2);
      ctx.beginPath();
      ctx.moveTo(st1.x, st1.y);
      ctx.lineTo(st2.x, st2.y);
      ctx.stroke();
    }

    // Uzunluk etiketi
    const dMid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };
    const labelScreen = worldToScreen(view, dMid);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const flip = angle > Math.PI / 2 || angle < -Math.PI / 2;
    ctx.save();
    ctx.translate(labelScreen.x, labelScreen.y);
    ctx.rotate(flip ? angle + Math.PI : angle);
    ctx.fillText(`${Math.round(lengthCm)}`, 0, -6);
    ctx.restore();
  }
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
  const isWindow = comp.tip === "pencere";
  // Seçim vurgusu (seçili olduğunda hafif kalın seçim çizgisi)
  if (selected) {
    ctx.save();
    ctx.beginPath();
    quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = "rgba(193, 101, 47, 0.4)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  // Duvar kesim sınırlarını çiz
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1.2;
  // Sol kesim yüzü (p1)
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  ctx.lineTo(quad[3].x, quad[3].y);
  ctx.stroke();
  // Sağ kesim yüzü (p2)
  ctx.beginPath();
  ctx.moveTo(quad[1].x, quad[1].y);
  ctx.lineTo(quad[2].x, quad[2].y);
  ctx.stroke();

  if (isDoor) {
    // Gerçek mimari kapı sembolü: menteşeden dik açılmış kanat + kanat ucundan
    // karşı pervaza (p2) süpüren çeyrek daire açılış yayı.
    const hingeWorld = p1;
    const swingEndWorld = { x: p1.x - dirY * widthCm, y: p1.y + dirX * widthCm };
    const hinge = worldToScreen(view, hingeWorld);
    const swingEnd = worldToScreen(view, swingEndWorld);
    const farJamb = worldToScreen(view, p2);

    ctx.strokeStyle = COLOR_RUST;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hinge.x, hinge.y);
    ctx.lineTo(swingEnd.x, swingEnd.y);
    ctx.stroke();

    const radius = Math.hypot(farJamb.x - hinge.x, farJamb.y - hinge.y);
    const startAngle = Math.atan2(swingEnd.y - hinge.y, swingEnd.x - hinge.x);
    const endAngle = Math.atan2(farJamb.y - hinge.y, farJamb.x - hinge.x);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.arc(hinge.x, hinge.y, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (isWindow) {
    // Gerçek mimari pencere sembolü: duvar kalınlığı boyunca çift ince paralel çizgi (cam).
    const s1 = worldToScreen(view, p1);
    const s2 = worldToScreen(view, p2);
    const perpX = -dirY;
    const perpY = dirX;
    const halfThickPx = (wallThickness / 2) * view.pxPerCm * 0.5;
    ctx.strokeStyle = selected ? COLOR_RUST : COLOR_BLUEPRINT;
    ctx.lineWidth = 1;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s1.x + perpX * halfThickPx * sign, s1.y + perpY * halfThickPx * sign);
      ctx.lineTo(s2.x + perpX * halfThickPx * sign, s2.y + perpY * halfThickPx * sign);
      ctx.stroke();
    }
  }

  if (comp.source === "auto-detected") {
    const midWorld = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    drawConfidenceBadge(ctx, worldToScreen(view, midWorld), comp.confidence);
  }
}

/**
 * En sık kullanılan 8 mobilya/tesisat alt tipi için elle çizilmiş, tanınabilir
 * siluetler (§ "gerçek mobilya ikonları"). `ctx` zaten bileşenin merkezine
 * çevrilmiş/döndürülmüş local koordinat sisteminde — w/d ekran pikseli
 * cinsinden, dikdörtgen [-w/2,-d/2, w, d]. Tanınmayan alt tipler için `false`
 * döner, çağıran taraf mevcut etiket-metni fallback'ine düşer.
 */
function drawFurnitureIcon(ctx: CanvasRenderingContext2D, subtypeId: string, w: number, d: number): boolean {
  const strokeColor = COLOR_INK;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;

  switch (subtypeId) {
    case "koltuk":
    case "tekli_koltuk": {
      // Kanepe: gövde + sırt minderi çizgisi + iki kolçak
      const armW = w * 0.12;
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, w, d);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, armW, d);
      ctx.rect(w / 2 - armW, -d / 2, armW, d);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2 + armW, -d / 2 + d * 0.32);
      ctx.lineTo(w / 2 - armW, -d / 2 + d * 0.32);
      ctx.stroke();
      return true;
    }
    case "yemek_masasi": {
      // Yemek masası: yuvarlatılmış dikdörtgen gövde
      const r = Math.min(w, d) * 0.12;
      ctx.beginPath();
      ctx.roundRect?.(-w / 2, -d / 2, w, d, r) ?? ctx.rect(-w / 2, -d / 2, w, d);
      ctx.stroke();
      return true;
    }
    case "sandalye": {
      // Sandalye: küçük kare oturak + sırt çizgisi
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2 + d * 0.2, w, d * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2, -d / 2 + d * 0.2);
      ctx.lineTo(w / 2, -d / 2 + d * 0.2);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.lineWidth = 1;
      return true;
    }
    case "yatak_tek":
    case "yatak_cift": {
      // Yatak: gövde + yastık(lar) + katlanma çizgisi
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, w, d);
      ctx.stroke();
      const pillowH = d * 0.18;
      const pillowCount = subtypeId === "yatak_cift" ? 2 : 1;
      const pillowW = (w * 0.8) / pillowCount - 4;
      for (let i = 0; i < pillowCount; i++) {
        const px = -w * 0.4 + i * (pillowW + 8);
        ctx.beginPath();
        ctx.rect(px, -d / 2 + d * 0.06, pillowW, pillowH);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-w / 2, -d / 2 + d * 0.32);
      ctx.lineTo(w / 2, -d / 2 + d * 0.32);
      ctx.stroke();
      return true;
    }
    case "gardirop": {
      // Gardırop: gövde + çift kapı orta çizgisi + köşe diyagonalleri (derinlik hissi)
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, w, d);
      ctx.moveTo(0, -d / 2);
      ctx.lineTo(0, d / 2);
      ctx.moveTo(-w / 2, -d / 2);
      ctx.lineTo(-w / 2 + Math.min(w, d) * 0.25, d / 2);
      ctx.moveTo(w / 2, -d / 2);
      ctx.lineTo(w / 2 - Math.min(w, d) * 0.25, d / 2);
      ctx.stroke();
      return true;
    }
    case "tv_unitesi": {
      // TV ünitesi: alçak gövde + üstte ortalanmış ekran dikdörtgeni
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, w, d);
      ctx.stroke();
      const screenW = w * 0.5;
      ctx.strokeRect(-screenW / 2, -d / 2 - d * 0.5, screenW, d * 0.35);
      return true;
    }
    case "mutfak_tezgahi": {
      // Mutfak tezgahı: gövde + iki ocak gözü dairesi
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, w, d);
      ctx.stroke();
      const r = Math.min(w, d) * 0.14;
      ctx.beginPath();
      ctx.arc(-w * 0.2, 0, r, 0, Math.PI * 2);
      ctx.moveTo(w * 0.2 + r, 0);
      ctx.arc(w * 0.2, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    }
    case "lavabo": {
      // Lavabo: gövde dikdörtgeni + oval hazne
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, w, d);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.32, d * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    }
    case "klozet": {
      // Klozet: arka rezervuar dikdörtgeni + oval kase
      const tankH = d * 0.28;
      ctx.beginPath();
      ctx.rect(-w * 0.4, -d / 2, w * 0.8, tankH);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, d * 0.08, w * 0.42, d * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    }
    default:
      return false;
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

  // Gerçek vektör ikonu (§ "gerçek mobilya ikonları") — bilinen 8 alt tip için;
  // tanınmayanlar mevcut etiket-metni fallback'inde kalır.
  const hasIcon = drawFurnitureIcon(ctx, comp.altTip, w, d);
  ctx.restore();

  if (!hasIcon) {
    ctx.font = "11px 'IBM Plex Sans', sans-serif";
    ctx.fillStyle = COLOR_INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(comp.altTip, c.x, c.y);
  }

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
  ctx.fillStyle = "#F2F0EA";
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
  // Arkadaki ızgara/kroki çizgilerini örten beyaz siluet dolgusu — oda rengiyle değil.
  ctx.fillStyle = "#FFFFFF";
  ctx.globalAlpha = 0.92;
  ctx.fillRect(tl.x, tl.y, w, h);
  ctx.globalAlpha = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = COLOR_BLUEPRINT;
  ctx.lineWidth = 1;
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
 * şimdiye kadar yerleştirilen köşeler + imlecin anlık konumuyla oluşan alan çizilirken
 * arkadaki ızgara/kroki çizgilerini örtmek için BEYAZ bir siluet dolgusu kullanılır —
 * oda tipinin rengiyle değil (§ "arkadan geçen silüet oda renginde değil beyaz olacak").
 * Çizim bitip oda kesinleştiğinde (drawRoom) bu dolgu tamamen kalkar, sadece ince
 * kontur kalır.
 */
export function drawRoomChainPreview(
  ctx: CanvasRenderingContext2D,
  view: View2D,
  points: Pt[],
  cursor: Pt | null,
  _fillColor?: string
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
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.92;
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
  ctx.lineWidth = 1;
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
