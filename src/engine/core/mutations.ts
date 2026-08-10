// Saf mutasyon fonksiyonları: (variant, ...args) -> yeni variant.
// Hiçbiri store'a dokunmaz; store.updateVariant bunları çağırıp undo/redo
// komutunu (before/after snapshot) otomatik oluşturur (§4 "tersinir komut nesneleri").

import {
  makeId,
  type BackgroundImage,
  type BagimsizBolum,
  type Corner,
  type FloorVariantData,
  type ID,
  type PlacedComponent,
  type Room,
  type TextAnnotation,
  type VectorTrace,
  type Wall,
} from "../../data/model";
import type { CatalogSubtype } from "../../data/componentCatalog";
import { DEFAULT_FLOOR_MATERIAL, DEFAULT_WALL_MATERIAL } from "../../data/materials";
import { dist, projectPointToSegment, segmentIntersection } from "../drawing/geometry";

const SNAP_RADIUS_CM = 20;

export function findNearestCorner(variant: FloorVariantData, p: { x: number; y: number }): ID | null {
  let best: ID | null = null;
  let bestDist = SNAP_RADIUS_CM;
  for (const c of Object.values(variant.corners)) {
    const d = dist(c, p);
    if (d <= bestDist) {
      best = c.id;
      bestDist = d;
    }
  }
  return best;
}

export function addCorner(variant: FloorVariantData, p: { x: number; y: number }): [FloorVariantData, ID] {
  const id = makeId("corner");
  const corner: Corner = { id, x: p.x, y: p.y };
  return [{ ...variant, corners: { ...variant.corners, [id]: corner } }, id];
}

/**
 * `addCorner`'ın toplu hali: her çağrıda TÜM `corners` sözlüğünü kopyalamaz.
 * `addCorner`'ı bir döngüde N kez çağırmak O(n²)'dir (her çağrı mevcut sözlüğü
 * baştan kopyalıyor) — büyük DXF/DWG içe aktarımlarında (binlerce köşe) bu, asıl
 * "donma" nedeniydi. Bu fonksiyon tek bir kopyalamayla O(n) çalışır.
 */
export function addCornersBulk(variant: FloorVariantData, points: { x: number; y: number }[]): [FloorVariantData, ID[]] {
  const newCorners: Record<ID, Corner> = {};
  const ids: ID[] = [];
  for (const p of points) {
    const id = makeId("corner");
    newCorners[id] = { id, x: p.x, y: p.y };
    ids.push(id);
  }
  return [{ ...variant, corners: { ...variant.corners, ...newCorners } }, ids];
}

function findWallBetween(variant: FloorVariantData, a: ID, b: ID): Wall | null {
  return (
    Object.values(variant.walls).find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)) ?? null
  );
}

export function addWall(
  variant: FloorVariantData,
  a: ID,
  b: ID,
  thickness = 20,
  malzeme: string = DEFAULT_WALL_MATERIAL
): FloorVariantData {
  if (a === b) return variant;
  if (findWallBetween(variant, a, b)) return variant;
  const id = makeId("wall");
  const wall: Wall = { id, a, b, thickness, malzeme, source: "manuel" };
  return { ...variant, walls: { ...variant.walls, [id]: wall } };
}

/**
 * `addWall`'ın toplu (bulk) hali: her çağrıda mevcut duvarlar arasında O(n) tekrar
 * taraması YAPMAZ — çağıran taraf çiftlerin zaten benzersiz olduğunu garanti eder.
 * Büyük DXF/DWG içe aktarımlarında (binlerce segment) `addWall`'ı döngüde çağırmak
 * O(n²) olup donmalara yol açıyordu; bu fonksiyon O(n)'dir.
 */
export function addWallsBulk(
  variant: FloorVariantData,
  pairs: [ID, ID][],
  thickness = 20,
  malzeme: string = DEFAULT_WALL_MATERIAL
): FloorVariantData {
  const newWalls: Record<ID, Wall> = {};
  for (const [a, b] of pairs) {
    if (a === b) continue;
    const id = makeId("wall");
    newWalls[id] = { id, a, b, thickness, malzeme, source: "manuel" };
  }
  return { ...variant, walls: { ...variant.walls, ...newWalls } };
}

/** cornerIds: kapalı döngü, ilk ve son eleman aynı köşe (döngüyü kapatan tekrar hariç tutulur). */
export function createRoomFromLoop(
  variant: FloorVariantData,
  cornerIds: ID[],
  typeId: string,
  defaultLabel: string,
  defaultHeight = 270
): [FloorVariantData, ID | null] {
  const loop = cornerIds[0] === cornerIds[cornerIds.length - 1] ? cornerIds.slice(0, -1) : cornerIds;
  if (loop.length < 3) return [variant, null];
  const wallLoop: ID[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const w = findWallBetween(variant, a, b);
    if (w) wallLoop.push(w.id);
  }
  const id = makeId("room");
  const room: Room = {
    id,
    cornerLoop: loop,
    wallLoop,
    typeId,
    name: defaultLabel,
    height: defaultHeight,
    zeminMalzemesi: DEFAULT_FLOOR_MATERIAL,
    source: "manuel",
  };
  return [{ ...variant, rooms: { ...variant.rooms, [id]: room } }, id];
}

/**
 * Yeni eklenen bir duvarın kapattığı en küçük döngüyü bulur.
 * Duvarlar artık birbirinden bağımsız çizildiği için (kullanıcı her segmenti ayrı
 * bas-sürükle-bırak ile çiziyor), oda algılaması bir "çizim zinciri" yerine duvar
 * grafındaki gerçek kapalı döngüye dayanır: yeni duvarı grafın dışında bırakıp
 * iki ucu arasında BFS ile en kısa yolu arar; bulunursa o yol + yeni duvar bir odadır.
 */
function findMinimalCycleThroughWall(variant: FloorVariantData, wallId: ID): ID[] | null {
  const wall = variant.walls[wallId];
  if (!wall) return null;

  const adjacency = new Map<ID, { corner: ID; wall: ID }[]>();
  for (const w of Object.values(variant.walls)) {
    if (w.id === wallId) continue; // yeni duvarı grafın dışında tut
    if (!adjacency.has(w.a)) adjacency.set(w.a, []);
    if (!adjacency.has(w.b)) adjacency.set(w.b, []);
    adjacency.get(w.a)!.push({ corner: w.b, wall: w.id });
    adjacency.get(w.b)!.push({ corner: w.a, wall: w.id });
  }

  // BFS: wall.a -> wall.b
  const prev = new Map<ID, ID>();
  const visited = new Set<ID>([wall.a]);
  const queue: ID[] = [wall.a];
  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === wall.b) {
      found = true;
      break;
    }
    for (const edge of adjacency.get(cur) ?? []) {
      if (visited.has(edge.corner)) continue;
      visited.add(edge.corner);
      prev.set(edge.corner, cur);
      queue.push(edge.corner);
    }
  }
  if (!found) return null;

  const path: ID[] = [];
  let node: ID | undefined = wall.b;
  while (node !== undefined) {
    path.push(node);
    if (node === wall.a) break;
    node = prev.get(node);
  }
  path.reverse();
  return path.length >= 3 ? path : null;
}

function sameCornerSet(a: ID[], b: ID[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

/**
 * Yeni eklenen duvar bir alanı kapattıysa otomatik oda oluşturur.
 * Aynı köşe kümesine sahip bir oda zaten varsa tekrar oluşturmaz.
 */
export function autoDetectRoomForWall(
  variant: FloorVariantData,
  wallId: ID,
  typeId: string,
  defaultLabel: string,
  defaultHeight = 270
): [FloorVariantData, ID | null] {
  const loop = findMinimalCycleThroughWall(variant, wallId);
  if (!loop) return [variant, null];
  const alreadyExists = Object.values(variant.rooms).some((r) => sameCornerSet(r.cornerLoop, loop));
  if (alreadyExists) return [variant, null];
  return createRoomFromLoop(variant, loop, typeId, defaultLabel, defaultHeight);
}

export function autoDetectAllRooms(
  variant: FloorVariantData,
  typeId: string,
  defaultLabel: string,
  defaultHeight = 270
): [FloorVariantData, ID[]] {
  let vv = variant;
  const createdIds: ID[] = [];
  for (const wallId of Object.keys(vv.walls)) {
    const loop = findMinimalCycleThroughWall(vv, wallId);
    if (loop && loop.length >= 3) {
      const alreadyExists = Object.values(vv.rooms).some((r) => sameCornerSet(r.cornerLoop, loop));
      if (!alreadyExists) {
        const [next, roomId] = createRoomFromLoop(vv, loop, typeId, defaultLabel, defaultHeight);
        vv = next;
        if (roomId) createdIds.push(roomId);
      }
    }
  }
  return [vv, createdIds];
}

/** Bu id'ler için "dış cepheye duvar örülmez" kuralı uygulanır (açık alan mantığı). */
const OPEN_AIR_ROOM_TYPES = new Set(["balkon", "teras"]);
const ATTACH_TOLERANCE_CM = 25;

/**
 * Verilen kenarın (p1-p2) her iki ucu da mevcut bir duvarın hattına yeterince
 * yakınsa (o duvarın üzerinde/bitişiğinde ilerliyorsa) true döner. Balkonun binaya
 * hangi kenardan bitiştiğini bulmak için kullanılır — köşelerin birebir aynı id'yi
 * paylaşması şartı aranmaz, çünkü balkon bir duvarın orta kısmına da bitişebilir.
 */
function edgeTouchesExistingWall(variant: FloorVariantData, p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
  for (const w of Object.values(variant.walls)) {
    const wa = variant.corners[w.a];
    const wb = variant.corners[w.b];
    if (!wa || !wb) continue;
    if (
      projectPointToSegment(p1, wa, wb).distance <= ATTACH_TOLERANCE_CM &&
      projectPointToSegment(p2, wa, wb).distance <= ATTACH_TOLERANCE_CM
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Hızlı Oda aracı (§4.1): iki köşesi verilen dikdörtgenden 4 duvar + 1 oda üretir.
 * Köşeler mevcut köşelere yapışır (snap), böylece bitişik odalar duvar paylaşabilir.
 *
 * Balkon/Teras gibi açık-alan tipleri özel davranır: dikdörtgenin binaya bitişik
 * olan kenarı (mevcut bir duvarın hattına yakın kenar) belirlenir, tam karşısındaki —
 * dış cepheye bakan — kenarda duvar OLUŞTURULMAZ; sadece iki yan kenarda (parapet)
 * duvar kalır. Oda poligonu (cornerLoop) yine de 4 köşeden oluşur, alan hesabı
 * etkilenmez — sadece o kenarda fiziksel duvar nesnesi yoktur.
 */
export function createRectangularRoom(
  variant: FloorVariantData,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  thickness: number,
  typeId: string,
  label: string,
  defaultHeight = 270
): [FloorVariantData, ID | null] {
  const minX = Math.min(p0.x, p1.x);
  const maxX = Math.max(p0.x, p1.x);
  const minY = Math.min(p0.y, p1.y);
  const maxY = Math.max(p0.y, p1.y);
  if (maxX - minX < 20 || maxY - minY < 20) return [variant, null];

  const köşeler = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  // Hangi kenarın (0:üst,1:sağ,2:alt,3:sol) binaya bitişik olduğunu, dikdörtgen
  // henüz köşe/duvar olarak eklenmeden ÖNCE, mevcut duvar hatlarına yakınlığa
  // bakarak belirle — tam karşısındaki kenar dış cephedir, duvar oluşturulmaz.
  let skipEdgeIndex = -1;
  if (OPEN_AIR_ROOM_TYPES.has(typeId)) {
    for (let i = 0; i < 4; i++) {
      if (edgeTouchesExistingWall(variant, köşeler[i], köşeler[(i + 1) % 4])) {
        skipEdgeIndex = (i + 2) % 4; // tam karşı kenar = dış cephe
        break;
      }
    }
  }

  let vv = variant;
  const cornerIds: ID[] = [];
  for (const p of köşeler) {
    let id = findNearestCorner(vv, p);
    if (!id) {
      const [next, newId] = addCorner(vv, p);
      vv = next;
      id = newId;
    }
    cornerIds.push(id);
  }

  for (let i = 0; i < cornerIds.length; i++) {
    if (i === skipEdgeIndex) continue; // dış cepheye bakan kenar: duvar yok, açık alan
    vv = addWall(vv, cornerIds[i], cornerIds[(i + 1) % cornerIds.length], thickness);
  }
  return createRoomFromLoop(vv, cornerIds, typeId, label, defaultHeight);
}

/** En son eklenen duvarı id'siyle bulur (addWall sonrası döngü algılaması için). */
export function findWallBetweenCorners(variant: FloorVariantData, a: ID, b: ID): ID | null {
  return findWallBetween(variant, a, b)?.id ?? null;
}

export function moveCorner(variant: FloorVariantData, cornerId: ID, p: { x: number; y: number }): FloorVariantData {
  const corner = variant.corners[cornerId];
  if (!corner) return variant;
  return {
    ...variant,
    corners: { ...variant.corners, [cornerId]: { ...corner, x: p.x, y: p.y } },
  };
}

export function deleteWall(variant: FloorVariantData, wallId: ID): FloorVariantData {
  if (!variant.walls[wallId]) return variant;
  const walls = { ...variant.walls };
  delete walls[wallId];
  const rooms = { ...variant.rooms };
  for (const [rid, room] of Object.entries(rooms)) {
    if (room.wallLoop.includes(wallId)) delete rooms[rid];
  }
  const components = { ...variant.components };
  for (const [cid, comp] of Object.entries(components)) {
    if (comp.konum.kind === "duvar" && comp.konum.duvarId === wallId) delete components[cid];
  }
  return { ...variant, walls, rooms, components };
}

export function deleteCorner(variant: FloorVariantData, cornerId: ID): FloorVariantData {
  if (!variant.corners[cornerId]) return variant;
  let next = variant;
  const attachedWalls = Object.values(variant.walls).filter((w) => w.a === cornerId || w.b === cornerId);
  for (const w of attachedWalls) {
    next = deleteWall(next, w.id);
  }
  const corners = { ...next.corners };
  delete corners[cornerId];
  return { ...next, corners };
}

/**
 * Oda tipini değiştirir. `autoLabel` verilirse ve odanın adı hâlâ otomatik atanmış bir
 * ad ise (ör. "Yeni Oda" veya önceki tipin etiketi), ad da yeni tipin etiketine
 * güncellenir — kullanıcı "Mutfak" seçince tuvalde "Mutfak" yazsın diye. Kullanıcı adı
 * elle değiştirmişse o ad korunur.
 */
export function setRoomType(
  variant: FloorVariantData,
  roomId: ID,
  typeId: string,
  autoLabel?: string,
  otomatikAdlar?: Set<string>
): FloorVariantData {
  const room = variant.rooms[roomId];
  if (!room) return variant;
  let name = room.name;
  if (autoLabel) {
    const adOtomatikMi = room.name === "Yeni Oda" || (otomatikAdlar?.has(room.name) ?? false);
    if (adOtomatikMi) name = autoLabel;
  }
  return { ...variant, rooms: { ...variant.rooms, [roomId]: { ...room, typeId, name } } };
}

/** Serbest bir düğüm noktası ekler ("Nokta" aracı) — sonradan çizgilerle bağlanabilir. */
export function addStandalonePoint(variant: FloorVariantData, p: { x: number; y: number }): [FloorVariantData, ID] {
  return addCorner(variant, p);
}

/**
 * Poligon aracı: serbest sayıda köşeden kapalı bir oda üretir. Her nokta önce mevcut
 * köşelere yapışmayı dener, böylece komşu odalarla köşe/duvar paylaşılır.
 */
export function createPolygonRoom(
  variant: FloorVariantData,
  points: { x: number; y: number }[],
  thickness: number,
  typeId: string,
  label: string,
  defaultHeight = 270
): [FloorVariantData, ID | null] {
  if (points.length < 3) return [variant, null];

  let vv = variant;
  const cornerIds: ID[] = [];
  for (const p of points) {
    let id = findNearestCorner(vv, p);
    if (!id) {
      const [next, newId] = addCorner(vv, p);
      vv = next;
      id = newId;
    }
    // Aynı köşeye iki kez yapışıldıysa dejenere kenar oluşmasın
    if (cornerIds[cornerIds.length - 1] === id) continue;
    cornerIds.push(id);
  }
  if (cornerIds.length >= 2 && cornerIds[0] === cornerIds[cornerIds.length - 1]) cornerIds.pop();
  if (cornerIds.length < 3) return [vv, null];

  for (let i = 0; i < cornerIds.length; i++) {
    vv = addWall(vv, cornerIds[i], cornerIds[(i + 1) % cornerIds.length], thickness);
  }
  return createRoomFromLoop(vv, cornerIds, typeId, label, defaultHeight);
}

/**
 * Döndürülmüş dikdörtgen: `a`→`b` taban kenarını ve bu kenara dik `depth` derinliğini
 * alarak eksene paralel olmayan (açılı) bir oda üretir (§4.5 "Döndürülmüş Dikdörtgen").
 */
export function createRotatedRectRoom(
  variant: FloorVariantData,
  a: { x: number; y: number },
  b: { x: number; y: number },
  depthCm: number,
  thickness: number,
  typeId: string,
  label: string,
  defaultHeight = 270
): [FloorVariantData, ID | null] {
  const len = dist(a, b);
  if (len < 20 || Math.abs(depthCm) < 20) return [variant, null];
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const px = -uy; // tabana dik birim vektör
  const py = ux;
  const köşeler = [
    a,
    b,
    { x: b.x + px * depthCm, y: b.y + py * depthCm },
    { x: a.x + px * depthCm, y: a.y + py * depthCm },
  ];
  return createPolygonRoom(variant, köşeler, thickness, typeId, label, defaultHeight);
}

/**
 * "Aynala" (§4.5): verilen köşeleri ve zemin bileşenlerini bir eksene göre yansıtır.
 * Simetrik binalarda tekrar çizimi hızlandırır. Yansıtma yerinde yapılır (kopya değil);
 * kopyalayarak aynalamak için önce Ctrl+C / Ctrl+V, sonra Aynala kullanılır.
 */
export function mirrorEntities(
  variant: FloorVariantData,
  cornerIds: ID[],
  floorComponentIds: ID[],
  axis: "vertical" | "horizontal",
  axisValue: number
): FloorVariantData {
  const corners = { ...variant.corners };
  for (const id of cornerIds) {
    const c = corners[id];
    if (!c) continue;
    corners[id] =
      axis === "vertical" ? { ...c, x: 2 * axisValue - c.x } : { ...c, y: 2 * axisValue - c.y };
  }

  const components = { ...variant.components };
  for (const id of floorComponentIds) {
    const comp = components[id];
    if (!comp || comp.konum.kind !== "zemin") continue;
    const k = comp.konum;
    components[id] = {
      ...comp,
      konum:
        axis === "vertical"
          ? { ...k, x: 2 * axisValue - k.x, rotationDeg: 180 - k.rotationDeg }
          : { ...k, y: 2 * axisValue - k.y, rotationDeg: -k.rotationDeg },
    };
  }

  // Aynalama poligonların yönünü ters çevirir; alan hesabı mutlak değer kullandığı
  // için odalar etkilenmez, cornerLoop olduğu gibi korunur.
  return { ...variant, corners, components };
}

export function setRoomName(variant: FloorVariantData, roomId: ID, name: string): FloorVariantData {
  const room = variant.rooms[roomId];
  if (!room) return variant;
  return { ...variant, rooms: { ...variant.rooms, [roomId]: { ...room, name } } };
}

export function setRoomHeight(variant: FloorVariantData, roomId: ID, height: number): FloorVariantData {
  const room = variant.rooms[roomId];
  if (!room) return variant;
  return { ...variant, rooms: { ...variant.rooms, [roomId]: { ...room, height } } };
}

export function deleteRoom(variant: FloorVariantData, roomId: ID): FloorVariantData {
  if (!variant.rooms[roomId]) return variant;
  const rooms = { ...variant.rooms };
  delete rooms[roomId];
  return { ...variant, rooms };
}

export function confirmEntity(
  variant: FloorVariantData,
  kind: "wall" | "room" | "component",
  id: ID
): FloorVariantData {
  if (kind === "wall") {
    const w = variant.walls[id];
    if (!w) return variant;
    return { ...variant, walls: { ...variant.walls, [id]: { ...w, source: "confirmed" } } };
  }
  if (kind === "room") {
    const r = variant.rooms[id];
    if (!r) return variant;
    return { ...variant, rooms: { ...variant.rooms, [id]: { ...r, source: "confirmed" } } };
  }
  const c = variant.components[id];
  if (!c) return variant;
  return { ...variant, components: { ...variant.components, [id]: { ...c, source: "confirmed" } } };
}

export function setWallThickness(variant: FloorVariantData, wallId: ID, thickness: number): FloorVariantData {
  const wall = variant.walls[wallId];
  if (!wall) return variant;
  return { ...variant, walls: { ...variant.walls, [wallId]: { ...wall, thickness } } };
}

export function setWallMaterial(variant: FloorVariantData, wallId: ID, malzeme: string): FloorVariantData {
  const wall = variant.walls[wallId];
  if (!wall) return variant;
  return { ...variant, walls: { ...variant.walls, [wallId]: { ...wall, malzeme } } };
}

export function setRoomFloorMaterial(variant: FloorVariantData, roomId: ID, zeminMalzemesi: string): FloorVariantData {
  const room = variant.rooms[roomId];
  if (!room) return variant;
  return { ...variant, rooms: { ...variant.rooms, [roomId]: { ...room, zeminMalzemesi } } };
}

/**
 * Bir duvarı verilen noktadan iki parçaya böler (§4.3 "Duvarı böl").
 * Üzerindeki bileşenler, düştükleri parçaya offset'i yeniden hesaplanarak taşınır.
 */
export function splitWall(variant: FloorVariantData, wallId: ID, at: { x: number; y: number }): FloorVariantData {
  const wall = variant.walls[wallId];
  if (!wall) return variant;
  const a = variant.corners[wall.a];
  const b = variant.corners[wall.b];
  if (!a || !b) return variant;

  const wallLen = dist(a, b);
  const proj = projectPointToSegment(at, a, b);
  const splitAt = proj.t * wallLen;
  // Uçlara çok yakınsa bölme anlamsız
  if (splitAt < 10 || wallLen - splitAt < 10) return variant;

  let vv = variant;
  const [withCorner, midId] = addCorner(vv, proj.point);
  vv = withCorner;

  const walls = { ...vv.walls };
  delete walls[wallId];
  vv = { ...vv, walls };

  vv = addWall(vv, wall.a, midId, wall.thickness, wall.malzeme);
  vv = addWall(vv, midId, wall.b, wall.thickness, wall.malzeme);

  const firstId = findWallBetween(vv, wall.a, midId)?.id;
  const secondId = findWallBetween(vv, midId, wall.b)?.id;

  // Bileşenleri doğru parçaya taşı
  const components = { ...vv.components };
  for (const [cid, comp] of Object.entries(components)) {
    if (comp.konum.kind !== "duvar" || comp.konum.duvarId !== wallId) continue;
    const off = comp.konum.offsetCm;
    if (off <= splitAt && firstId) {
      components[cid] = { ...comp, konum: { ...comp.konum, duvarId: firstId, offsetCm: off } };
    } else if (secondId) {
      components[cid] = { ...comp, konum: { ...comp.konum, duvarId: secondId, offsetCm: off - splitAt } };
    }
  }

  // Odaların duvar döngülerini yenile
  const rooms = { ...vv.rooms };
  for (const [rid, room] of Object.entries(rooms)) {
    if (!room.wallLoop.includes(wallId)) continue;
    const newLoop: ID[] = [];
    for (let i = 0; i < room.cornerLoop.length; i++) {
      const c1 = room.cornerLoop[i];
      const c2 = room.cornerLoop[(i + 1) % room.cornerLoop.length];
      const w = findWallBetween(vv, c1, c2);
      if (w) newLoop.push(w.id);
    }
    rooms[rid] = { ...room, wallLoop: newLoop };
  }

  return { ...vv, components, rooms };
}

/**
 * Yeni bir duvar ucunu çözümler: en yakın köşeye yapış, yoksa mevcut bir duvarın
 * gövdesine (T/X kesişimi) denk geliyorsa o duvarı böl ve kesişim noktasında yeni
 * bir köşe oluştur, o da yoksa serbest bir köşe ekle. Böylece yeni çizilen duvarlar
 * mevcut duvarlarla otomatik olarak birleşir (§7 "sürekli kesişim/junction algılaması").
 */
export function resolveWallEndpoint(
  variant: FloorVariantData,
  point: { x: number; y: number },
  excludeWallId?: ID
): [FloorVariantData, ID] {
  const existingCornerId = findNearestCorner(variant, point);
  if (existingCornerId) return [variant, existingCornerId];

  let bestWallId: ID | null = null;
  let bestDist = SNAP_RADIUS_CM;
  for (const w of Object.values(variant.walls)) {
    if (w.id === excludeWallId) continue;
    const a = variant.corners[w.a];
    const b = variant.corners[w.b];
    if (!a || !b) continue;
    const proj = projectPointToSegment(point, a, b);
    const wallLen = dist(a, b);
    const splitAt = proj.t * wallLen;
    if (splitAt < 10 || wallLen - splitAt < 10) continue; // uca çok yakınsa köşeye yapışmış sayılır
    if (proj.distance <= bestDist) {
      bestWallId = w.id;
      bestDist = proj.distance;
    }
  }

  if (bestWallId) {
    const wall = variant.walls[bestWallId];
    const a = variant.corners[wall.a];
    const b = variant.corners[wall.b];
    const proj = projectPointToSegment(point, a, b);
    const split = splitWall(variant, bestWallId, proj.point);
    const junctionId = findNearestCorner(split, proj.point);
    if (junctionId) return [split, junctionId];
  }

  return addCorner(variant, point);
}

/**
 * `resolveWallEndpoint` sadece yeni duvarın UÇLARINI mevcut duvarlara bağlar.
 * Bu fonksiyon ise yeni duvarın GÖVDESİNİN mevcut duvarları ortadan (X kesişimi)
 * kestiği durumları da yakalar: her kesişimde hem mevcut duvar hem de yeni duvar
 * o noktada bölünür, kesişim noktasında ortak bir köşe oluşturulur (§7).
 */
export function addWallWithJunctions(
  variant: FloorVariantData,
  aCornerId: ID,
  bCornerId: ID,
  thickness = 20,
  malzeme: string = DEFAULT_WALL_MATERIAL
): FloorVariantData {
  if (aCornerId === bCornerId) return variant;
  let vv = variant;
  const a = vv.corners[aCornerId];
  const b = vv.corners[bCornerId];
  if (!a || !b) return vv;

  // Yeni duvarın gövdesini kesen mevcut duvarları bul (t'ye göre sıralı).
  type Crossing = { wallId: ID; t: number; point: { x: number; y: number } };
  const crossings: Crossing[] = [];
  for (const w of Object.values(vv.walls)) {
    if (w.a === aCornerId || w.a === bCornerId || w.b === aCornerId || w.b === bCornerId) continue;
    const wa = vv.corners[w.a];
    const wb = vv.corners[w.b];
    if (!wa || !wb) continue;
    const hit = segmentIntersection(a, b, wa, wb);
    if (hit) crossings.push({ wallId: w.id, t: hit.t, point: hit.point });
  }
  crossings.sort((x, y) => x.t - y.t);

  let fromId = aCornerId;
  for (const crossing of crossings) {
    // Aradaki mevcut duvar önceki adımda zaten bölünmüş/değişmiş olabilir; güncel halini tekrar bul.
    const stillThere = vv.walls[crossing.wallId];
    if (!stillThere) continue;
    const wa = vv.corners[stillThere.a];
    const wb = vv.corners[stillThere.b];
    if (!wa || !wb) continue;
    const proj = projectPointToSegment(crossing.point, wa, wb);
    const wallLen = dist(wa, wb);
    const splitAt = proj.t * wallLen;
    if (splitAt < 10 || wallLen - splitAt < 10) continue; // uca çok yakın, ayrı bir kesişim değil
    vv = splitWall(vv, crossing.wallId, proj.point);
    const junctionId = findNearestCorner(vv, proj.point);
    if (!junctionId) continue;
    vv = addWall(vv, fromId, junctionId, thickness, malzeme);
    fromId = junctionId;
  }
  vv = addWall(vv, fromId, bCornerId, thickness, malzeme);
  return vv;
}

function buildOznitelikler(
  subtype: CatalogSubtype,
  overrides: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const oznitelikler: Record<string, string | number | boolean> = {};
  for (const attr of subtype.attributes) oznitelikler[attr.key] = overrides[attr.key] ?? attr.default;
  return oznitelikler;
}

export function addWallComponent(
  variant: FloorVariantData,
  tip: string,
  subtype: CatalogSubtype,
  duvarId: ID,
  offsetCm: number,
  overrides: Record<string, string | number | boolean> = {}
): FloorVariantData {
  const id = makeId("comp");
  const comp: PlacedComponent = {
    id,
    tip,
    altTip: subtype.id,
    konum: { kind: "duvar", duvarId, offsetCm },
    oznitelikler: buildOznitelikler(subtype, overrides),
    source: "manuel",
  };
  return { ...variant, components: { ...variant.components, [id]: comp } };
}

export function addFloorComponent(
  variant: FloorVariantData,
  tip: string,
  subtype: CatalogSubtype,
  p: { x: number; y: number },
  overrides: Record<string, string | number | boolean> = {}
): FloorVariantData {
  const id = makeId("comp");
  const comp: PlacedComponent = {
    id,
    tip,
    altTip: subtype.id,
    konum: { kind: "zemin", x: p.x, y: p.y, rotationDeg: 0 },
    oznitelikler: buildOznitelikler(subtype, overrides),
    source: "manuel",
  };
  return { ...variant, components: { ...variant.components, [id]: comp } };
}

/** Panodan yapıştırma: kaynak bileşeni ofsetlenmiş bir konumda, yeni id ile kopyalar. */
export function pasteFloorComponent(
  variant: FloorVariantData,
  source: PlacedComponent,
  offsetX: number,
  offsetY: number
): [FloorVariantData, ID] {
  const id = makeId("comp");
  const baseKonum = source.konum.kind === "zemin" ? source.konum : { x: 0, y: 0, rotationDeg: 0, kind: "zemin" as const };
  const comp: PlacedComponent = {
    ...source,
    id,
    konum: { kind: "zemin", x: baseKonum.x + offsetX, y: baseKonum.y + offsetY, rotationDeg: baseKonum.rotationDeg },
  };
  return [{ ...variant, components: { ...variant.components, [id]: comp } }, id];
}

export function moveFloorComponent(variant: FloorVariantData, componentId: ID, p: { x: number; y: number }): FloorVariantData {
  const comp = variant.components[componentId];
  if (!comp || comp.konum.kind !== "zemin") return variant;
  return {
    ...variant,
    components: { ...variant.components, [componentId]: { ...comp, konum: { ...comp.konum, x: p.x, y: p.y } } },
  };
}

export function setComponentRotation(variant: FloorVariantData, componentId: ID, rotationDeg: number): FloorVariantData {
  const comp = variant.components[componentId];
  if (!comp || comp.konum.kind !== "zemin") return variant;
  return {
    ...variant,
    components: { ...variant.components, [componentId]: { ...comp, konum: { ...comp.konum, rotationDeg } } },
  };
}

export function updateComponentAttr(
  variant: FloorVariantData,
  componentId: ID,
  key: string,
  value: string | number | boolean
): FloorVariantData {
  const comp = variant.components[componentId];
  if (!comp) return variant;
  return {
    ...variant,
    components: {
      ...variant.components,
      [componentId]: { ...comp, oznitelikler: { ...comp.oznitelikler, [key]: value } },
    },
  };
}

export function removeComponent(variant: FloorVariantData, componentId: ID): FloorVariantData {
  if (!variant.components[componentId]) return variant;
  const components = { ...variant.components };
  delete components[componentId];
  return { ...variant, components };
}

export function addTextAnnotation(variant: FloorVariantData, p: { x: number; y: number }, text: string): FloorVariantData {
  const id = makeId("text");
  const ann: TextAnnotation = { id, x: p.x, y: p.y, text };
  return { ...variant, textAnnotations: { ...variant.textAnnotations, [id]: ann } };
}

export function removeTextAnnotation(variant: FloorVariantData, id: ID): FloorVariantData {
  if (!variant.textAnnotations[id]) return variant;
  const textAnnotations = { ...variant.textAnnotations };
  delete textAnnotations[id];
  return { ...variant, textAnnotations };
}

// --- Bağımsız Bölüm (§4.4) ---

/** Seçili odaları tek bir Bağımsız Bölüm altında gruplar ("BB Sınır" aracının karşılığı). */
export function createBagimsizBolum(
  variant: FloorVariantData,
  odaIds: ID[],
  kat: string,
  tip: "MSKN" | "TIC" = "MSKN"
): [FloorVariantData, ID | null] {
  const gecerliOdalar = odaIds.filter((id) => variant.rooms[id]);
  if (gecerliOdalar.length === 0) return [variant, null];

  const id = makeId("bb");
  const sira = Object.keys(variant.bagimsizBolumler).length + 1;
  const bb: BagimsizBolum = { id, kod: `${kat}_${sira}`, kat, tip, odaIds: gecerliOdalar };

  const rooms = { ...variant.rooms };
  for (const odaId of gecerliOdalar) {
    rooms[odaId] = { ...rooms[odaId], bagimsizBolumId: id };
  }
  return [{ ...variant, rooms, bagimsizBolumler: { ...variant.bagimsizBolumler, [id]: bb } }, id];
}

export function updateBagimsizBolum(
  variant: FloorVariantData,
  bbId: ID,
  patch: Partial<Omit<BagimsizBolum, "id">>
): FloorVariantData {
  const bb = variant.bagimsizBolumler[bbId];
  if (!bb) return variant;
  return { ...variant, bagimsizBolumler: { ...variant.bagimsizBolumler, [bbId]: { ...bb, ...patch } } };
}

export function deleteBagimsizBolum(variant: FloorVariantData, bbId: ID): FloorVariantData {
  const bb = variant.bagimsizBolumler[bbId];
  if (!bb) return variant;
  const bagimsizBolumler = { ...variant.bagimsizBolumler };
  delete bagimsizBolumler[bbId];
  const rooms = { ...variant.rooms };
  for (const odaId of bb.odaIds) {
    if (rooms[odaId]) {
      const { bagimsizBolumId: _removed, ...rest } = rooms[odaId];
      void _removed;
      rooms[odaId] = rest as Room;
    }
  }
  return { ...variant, rooms, bagimsizBolumler };
}

/** "Alan Yaz" (§4.5): otomatik hesaplanan alanı elle girilen değerle geçersiz kılar. */
export function setRoomManualArea(variant: FloorVariantData, roomId: ID, m2: number | undefined): FloorVariantData {
  const room = variant.rooms[roomId];
  if (!room) return variant;
  return { ...variant, rooms: { ...variant.rooms, [roomId]: { ...room, manuelAlanM2: m2 } } };
}

export function setBackgroundImage(variant: FloorVariantData, image: BackgroundImage): FloorVariantData {
  return { ...variant, backgroundImage: image };
}

export function updateBackgroundImage(variant: FloorVariantData, patch: Partial<BackgroundImage>): FloorVariantData {
  if (!variant.backgroundImage) return variant;
  return { ...variant, backgroundImage: { ...variant.backgroundImage, ...patch } };
}

export function removeBackgroundImage(variant: FloorVariantData): FloorVariantData {
  if (!variant.backgroundImage) return variant;
  return { ...variant, backgroundImage: null };
}

/**
 * DWG/DXF içe aktarımından gelen ham çizgi krokisini ayarlar. Wall/Corner/Room
 * ÜRETMEZ — "otomatik tanıma yapma, dosyayı olduğu gibi aç" ilkesi (bkz. VectorTrace).
 * Varsayılan konum (0,0) — parsel merkezine hizalama çağıran taraf (importDispatch,
 * parsel bilgisine erişimi olan tek yer) sorumluluğundadır (bkz. updateVectorTrace).
 */
export function setVectorTrace(
  variant: FloorVariantData,
  segments: VectorTrace["segments"],
  widthCm: number,
  heightCm: number
): FloorVariantData {
  const trace: VectorTrace = {
    segments,
    widthCm,
    heightCm,
    x: 0,
    y: 0,
    rotationDeg: 0,
    scale: 1,
    opacity: 1,
    visible: true,
    locked: false,
  };
  return { ...variant, vectorTrace: trace };
}

export function updateVectorTrace(variant: FloorVariantData, patch: Partial<VectorTrace>): FloorVariantData {
  if (!variant.vectorTrace) return variant;
  return { ...variant, vectorTrace: { ...variant.vectorTrace, ...patch } };
}

export function removeVectorTrace(variant: FloorVariantData): FloorVariantData {
  if (!variant.vectorTrace) return variant;
  return { ...variant, vectorTrace: null };
}

export function mirrorSelectedEntities(
  variant: FloorVariantData,
  cornerIds: ID[],
  floorCompIds: ID[],
  axis: "vertical" | "horizontal",
  centerVal: number
): FloorVariantData {
  const corners = { ...variant.corners };
  for (const id of cornerIds) {
    const c = corners[id];
    if (!c) continue;
    if (axis === "vertical") {
      corners[id] = { ...c, x: 2 * centerVal - c.x };
    } else {
      corners[id] = { ...c, y: 2 * centerVal - c.y };
    }
  }

  const components = { ...variant.components };
  for (const id of floorCompIds) {
    const comp = components[id];
    if (!comp || comp.konum.kind !== "zemin") continue;
    if (axis === "vertical") {
      components[id] = {
        ...comp,
        konum: { ...comp.konum, x: 2 * centerVal - comp.konum.x },
      };
    } else {
      components[id] = {
        ...comp,
        konum: { ...comp.konum, y: 2 * centerVal - comp.konum.y },
      };
    }
  }

  return { ...variant, corners, components };
}

/**
 * Seçili köşeleri/bileşenleri verilen pivot noktası etrafında `angleDeg` derece
 * döndürür; zemin bileşenlerinin kendi `rotationDeg`'i de aynı miktarda değişir
 * (§ "Döndür özelliği").
 */
export function rotateSelectedEntities(
  variant: FloorVariantData,
  cornerIds: ID[],
  floorCompIds: ID[],
  angleDeg: number,
  pivot: { x: number; y: number }
): FloorVariantData {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatePoint = (x: number, y: number) => ({
    x: pivot.x + (x - pivot.x) * cos - (y - pivot.y) * sin,
    y: pivot.y + (x - pivot.x) * sin + (y - pivot.y) * cos,
  });

  const corners = { ...variant.corners };
  for (const id of cornerIds) {
    const c = corners[id];
    if (!c) continue;
    const p = rotatePoint(c.x, c.y);
    corners[id] = { ...c, x: p.x, y: p.y };
  }

  const components = { ...variant.components };
  for (const id of floorCompIds) {
    const comp = components[id];
    if (!comp || comp.konum.kind !== "zemin") continue;
    const p = rotatePoint(comp.konum.x, comp.konum.y);
    components[id] = {
      ...comp,
      konum: { ...comp.konum, x: p.x, y: p.y, rotationDeg: ((comp.konum.rotationDeg ?? 0) + angleDeg + 360) % 360 },
    };
  }

  return { ...variant, corners, components };
}
