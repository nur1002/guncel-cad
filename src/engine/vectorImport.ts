// GeoJSON ve temel DXF vektör içe aktarma. Koordinatların gerçek dünya ölçeği
// dosyadan kesin olarak bilinemediği için (GeoJSON enlem/boylam ya da yerel birim
// olabilir, DXF birimleri dosyada standartlaşmamıştır), kullanıcıya makul bir
// varsayılanla ölçek sorulur — bu, dış veriyle çalışan CAD araçlarında yaygın bir
// desendir (AutoCAD "INSUNITS" uyarısı gibi).

import * as M from "./mutations";
import { DEFAULT_ROOM_TYPE_ID } from "../data/roomTypes";
import type { FloorVariantData, ID } from "../data/model";
import type { Pt } from "./geometry";

export interface VectorImportResult {
  apply: (variant: FloorVariantData) => FloorVariantData;
  readonly cornerCount: number;
  readonly wallCount: number;
  /** Kullanıcıya bildirilmesi gereken ölçek varsayımı (ör. "1 birim = 1 metre kabul edildi"). */
  readonly scaleNote: string;
}

function buildFromPointLoops(loops: { points: Pt[]; closed: boolean }[], scaleNote: string): VectorImportResult {
  let cornerCount = 0;
  let wallCount = 0;
  const apply = (variant: FloorVariantData): FloorVariantData => {
    let vv = variant;
    for (const loop of loops) {
      if (loop.points.length < 2) continue;
      const cornerIds: ID[] = [];
      for (const p of loop.points) {
        let id = M.findNearestCorner(vv, p);
        if (!id) {
          const [next, newId] = M.addCorner(vv, p);
          vv = next;
          id = newId;
          cornerCount++;
        }
        cornerIds.push(id);
      }
      const segCount = loop.closed ? cornerIds.length : cornerIds.length - 1;
      for (let i = 0; i < segCount; i++) {
        const a = cornerIds[i];
        const b = cornerIds[(i + 1) % cornerIds.length];
        const before = vv;
        vv = M.addWall(vv, a, b, 20);
        if (vv !== before) wallCount++;
      }
      if (loop.closed && cornerIds.length >= 3) {
        // cornerIds kaynak veriye göre zaten kapalı (ilk=son) olabilir; createRoomFromLoop
        // bu durumu kendisi algılayıp tekilleştirdiği için burada tekrar eklenmez.
        const [next] = M.createRoomFromLoop(vv, cornerIds, DEFAULT_ROOM_TYPE_ID, "İçe Aktarılan Oda");
        vv = next;
      }
    }
    return vv;
  };
  return {
    apply,
    scaleNote,
    get cornerCount() {
      return cornerCount;
    },
    get wallCount() {
      return wallCount;
    },
  };
}

// --- GeoJSON ---

export function isGeoJsonFile(file: File): boolean {
  return /\.(geojson|json)$/i.test(file.name);
}

interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

function extractFirstGeometry(obj: unknown): GeoJsonGeometry | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o.type === "FeatureCollection" && Array.isArray(o.features)) {
    for (const f of o.features) {
      const g = extractFirstGeometry(f);
      if (g) return g;
    }
    return null;
  }
  if (o.type === "Feature") return extractFirstGeometry(o.geometry);
  if (o.type === "Polygon" || o.type === "LineString" || o.type === "MultiPolygon" || o.type === "MultiLineString") {
    return o as unknown as GeoJsonGeometry;
  }
  return null;
}

function detectSuggestedScale(points: Pt[]): number {
  // Değerler enlem/boylam aralığında ve ondalıklıysa (derece), kaba bir metre
  // dönüşümü öner; aksi halde koordinatların zaten metre cinsinden olduğunu varsay.
  const looksGeographic = points.every((p) => Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90);
  const hasFraction = points.some((p) => !Number.isInteger(p.x) || !Number.isInteger(p.y));
  return looksGeographic && hasFraction ? 111320 : 1;
}

export async function parseGeoJsonFile(file: File): Promise<VectorImportResult> {
  const text = await file.text();
  const json = JSON.parse(text);
  const geom = extractFirstGeometry(json);
  if (!geom) throw new Error("GeoJSON içinde desteklenen bir geometri (Polygon/LineString) bulunamadı.");

  let ring: number[][];
  let closed: boolean;
  if (geom.type === "Polygon") {
    ring = (geom.coordinates as number[][][])[0];
    closed = true;
  } else if (geom.type === "MultiPolygon") {
    ring = (geom.coordinates as number[][][][])[0][0];
    closed = true;
  } else if (geom.type === "LineString") {
    ring = geom.coordinates as number[][];
    closed = false;
  } else {
    ring = (geom.coordinates as number[][][])[0];
    closed = false;
  }

  const rawPoints: Pt[] = ring.map(([x, y]) => ({ x, y }));
  const metersPerUnit = detectSuggestedScale(rawPoints);
  const isGeographic = metersPerUnit !== 1;

  const origin = rawPoints[0];
  const points: Pt[] = rawPoints.map((p) => ({
    x: (p.x - origin.x) * metersPerUnit * 100,
    y: (p.y - origin.y) * metersPerUnit * 100,
  }));

  const scaleNote = isGeographic
    ? "Koordinatlar enlem/boylam gibi görünüyor; yaklaşık 111.32 km/derece ile dönüştürüldü (kesin değildir)."
    : "Koordinatların zaten metre cinsinden olduğu varsayıldı (1 birim = 1 m).";

  return buildFromPointLoops([{ points, closed }], scaleNote);
}

// --- DXF (yalnızca LINE ve LWPOLYLINE varlıkları) ---

export function isDxfFile(file: File): boolean {
  return /\.dxf$/i.test(file.name);
}

interface DxfEntity {
  points: Pt[];
  closed: boolean;
}

function parseDxfEntities(text: string): DxfEntity[] {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push([lines[i].trim(), lines[i + 1].trim()]);
  }

  const entities: DxfEntity[] = [];
  let i = 0;
  let inEntities = false;
  while (i < pairs.length) {
    const [code, value] = pairs[i];
    if (code === "2" && value === "ENTITIES") inEntities = true;
    if (code === "0" && value === "ENDSEC") inEntities = false;

    if (inEntities && code === "0" && (value === "LINE" || value === "LWPOLYLINE")) {
      const type = value;
      i++;
      if (type === "LINE") {
        let x1 = 0;
        let y1 = 0;
        let x2 = 0;
        let y2 = 0;
        while (i < pairs.length && pairs[i][0] !== "0") {
          const [c, v] = pairs[i];
          if (c === "10") x1 = parseFloat(v);
          else if (c === "20") y1 = parseFloat(v);
          else if (c === "11") x2 = parseFloat(v);
          else if (c === "21") y2 = parseFloat(v);
          i++;
        }
        entities.push({ points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], closed: false });
      } else {
        const points: Pt[] = [];
        let closed = false;
        let curX: number | null = null;
        while (i < pairs.length && pairs[i][0] !== "0") {
          const [c, v] = pairs[i];
          if (c === "70") closed = (parseInt(v, 10) & 1) === 1;
          else if (c === "10") curX = parseFloat(v);
          else if (c === "20" && curX !== null) {
            points.push({ x: curX, y: parseFloat(v) });
            curX = null;
          }
          i++;
        }
        entities.push({ points, closed });
      }
      continue;
    }
    i++;
  }
  return entities;
}

export async function parseDxfFile(file: File): Promise<VectorImportResult> {
  const text = await file.text();
  const entities = parseDxfEntities(text).filter((e) => e.points.length >= 2);
  if (entities.length === 0) {
    throw new Error("DXF içinde desteklenen bir varlık (LINE/LWPOLYLINE) bulunamadı.");
  }

  const allPoints = entities.flatMap((e) => e.points);
  const minX = Math.min(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));

  // DXF dosyaları birimlerini standart bir şekilde beyan etmez; mimari çizimlerde
  // en yaygın kullanım metre olduğu için 1 birim = 1 m (100 cm) varsayılır.
  const cmPerUnit = 100;
  const loops = entities.map((e) => ({
    points: e.points.map((p) => ({ x: (p.x - minX) * cmPerUnit, y: (p.y - minY) * cmPerUnit })),
    closed: e.closed,
  }));

  const scaleNote = "DXF biriminin metre olduğu varsayıldı (1 birim = 100 cm). Ölçek farklıysa duvarları yeniden çizmeniz gerekebilir.";
  return buildFromPointLoops(loops, scaleNote);
}
