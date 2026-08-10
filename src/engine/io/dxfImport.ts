// GeoJSON ve temel DXF vektör içe aktarma. Koordinatların gerçek dünya ölçeği
// dosyadan kesin olarak bilinemediği için (GeoJSON enlem/boylam ya da yerel birim
// olabilir, DXF birimleri dosyada standartlaşmamıştır), kullanıcıya makul bir
// varsayılanla ölçek sorulur — bu, dış veriyle çalışan CAD araçlarında yaygın bir
// desendir (AutoCAD "INSUNITS" uyarısı gibi).

import * as M from "../core/mutations";
import { DEFAULT_ROOM_TYPE_ID } from "../../data/roomTypes";
import type { FloorVariantData, ID } from "../../data/model";
import type { Pt } from "../drawing/geometry";
import {
  buildFilteredGraph,
  centerTraceSegments,
  dxfTextToScaledLoops,
  loopsToTraceSegments,
  type FilteredGraph,
  type RawLoop,
  type TraceSegment,
} from "./vectorGraph";

export interface VectorTraceImportResult {
  apply: (variant: FloorVariantData) => FloorVariantData;
  readonly segmentCount: number;
  /** Kullanıcıya bildirilmesi gereken ölçek varsayımı (ör. "1 birim = 1 metre kabul edildi"). */
  readonly scaleNote: string;
}

/**
 * Ham çizgi segmentlerini doğrudan `vectorTrace` katmanına yazar — Wall/Corner/Room
 * ÜRETMEZ (§ "otomatik tanıma yapmasın, dosyayı olduğu gibi açsın"). Bu yüzden hiçbir
 * grafik/döngü algoritmasına ihtiyaç yoktur; yalnızca bbox merkezleme + O(1) atama.
 * Parsel merkezine yerleştirme (x,y varsayılanı), parsel bilgisine sahip tek yer olan
 * `importDispatch.ts` tarafından `apply()` sonrası ayrıca yapılır.
 */
export function applyTraceSegments(variant: FloorVariantData, segments: TraceSegment[]): FloorVariantData {
  const centered = centerTraceSegments(segments);
  return M.setVectorTrace(variant, centered.segments, centered.widthCm, centered.heightCm);
}

export interface VectorImportResult {
  apply: (variant: FloorVariantData) => FloorVariantData;
  readonly cornerCount: number;
  readonly wallCount: number;
  readonly roomCount: number;
  /** Kapalı bir döngüye ait olmadığı için duvara ÇEVRİLMEDEN atlanan segment sayısı
   *  (mobilya/ölçü çizgisi/tarama gibi tek başına duran, oda sınırı olmayan çizgiler). */
  readonly skippedCount: number;
  /** Kullanıcıya bildirilmesi gereken ölçek varsayımı (ör. "1 birim = 1 metre kabul edildi"). */
  readonly scaleNote: string;
}

const IMPORT_EXACT_EPSILON_CM = 0.01;
export function findExactCorner(variant: FloorVariantData, p: Pt): ID | null {
  for (const c of Object.values(variant.corners)) {
    if (Math.abs(c.x - p.x) <= IMPORT_EXACT_EPSILON_CM && Math.abs(c.y - p.y) <= IMPORT_EXACT_EPSILON_CM) {
      return c.id;
    }
  }
  return null;
}

/**
 * Önceden filtrelenmiş bir grafiği (bkz. vectorGraph.ts — Worker içinde de
 * çalıştırılabilen saf hesaplama) gerçek `FloorVariantData`'ya uygular: köşeler
 * toplu (O(n)) eklenir, yalnızca kapalı döngü segmentleri duvar olur, mevcut
 * test edilmiş grafik-döngü algoritmasıyla odalar algılanır.
 */
export function applyFilteredGraph(
  variant: FloorVariantData,
  graph: FilteredGraph
): { variant: FloorVariantData; wallCount: number; roomCount: number } {
  const [withCorners, ids] = M.addCornersBulk(variant, graph.points);
  let vv = withCorners;
  const pairs: [ID, ID][] = graph.wallPairs.map(([a, b]) => [ids[a], ids[b]]);
  vv = M.addWallsBulk(vv, pairs, 20);

  // Sadece küçük ve orta ölçekli planlar için otomatik oda algılama yapıyoruz.
  // 150'den fazla duvara sahip büyük planlarda O(N^2) BFS oda arama algoritması
  // tarayıcı ana thread'ini kilitleyerek "Sayfa Yanıt Vermiyor" hatasına yol açar.
  let roomIds: ID[] = [];
  if (pairs.length < 150) {
    const [next, detectedIds] = M.autoDetectAllRooms(vv, DEFAULT_ROOM_TYPE_ID, "İçe Aktarılan Oda");
    vv = next;
    roomIds = detectedIds;
  }

  return { variant: vv, wallCount: pairs.length, roomCount: roomIds.length };
}

/**
 * Gerçek DWG/DXF dosyaları binlerce varlık içerebilir (duvar, mobilya, ölçü
 * çizgisi, tarama, metin altı çizgisi vb.). Hepsini otomatik olarak "duvar"
 * nesnesine çevirmek iki soruna yol açıyordu:
 *   1) Donma: köşe/duvar eşleştirmesi eski kodda O(n) doğrusal arama ile
 *      yapılıyordu — binlerce segment için bu O(n²) olup sekmeyi kilitliyordu.
 *   2) "Karman çorman" görünüm: mobilya/ölçü/tarama gibi oda sınırı OLMAYAN
 *      tek başına duran çizgiler de duvar olarak eklenince plan anlamsız bir
 *      çizgi yığınına dönüşüyordu.
 * Çözüm: köşeler O(1) hash ile eşleştirilir (donma giderilir) VE yalnızca
 * KAPALI BİR DÖNGÜNÜN parçası olan segmentler duvara çevrilir (köprü/bağlantısız
 * segmentler atlanır) — bu, kullanıcının istediği "sadece odaları/4 köşesi
 * birleşen yerleri tanısın" davranışının ta kendisidir; hiçbir tahmin yapılmaz,
 * yalnızca dosyadaki gerçek bağlantı grafiği kullanılır.
 */
function buildFromPointLoops(loops: RawLoop[], scaleNote: string): VectorImportResult {
  let wallCount = 0;
  let roomCount = 0;
  const graph = buildFilteredGraph(loops);

  const apply = (variant: FloorVariantData): FloorVariantData => {
    const result = applyFilteredGraph(variant, graph);
    wallCount = result.wallCount;
    roomCount = result.roomCount;
    return result.variant;
  };

  return {
    apply,
    scaleNote,
    get cornerCount() {
      return graph.points.length;
    },
    get wallCount() {
      return wallCount;
    },
    get roomCount() {
      return roomCount;
    },
    get skippedCount() {
      return graph.skippedCount;
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

// --- DXF (LINE, LWPOLYLINE, klasik POLYLINE/VERTEX, ARC, CIRCLE) ---

export function isDxfFile(file: File): boolean {
  return /\.dxf$/i.test(file.name);
}

export async function parseDxfFile(file: File): Promise<VectorTraceImportResult> {
  const text = await file.text();
  const { loops, scaleNote } = dxfTextToScaledLoops(text);
  const segments = loopsToTraceSegments(loops);
  return {
    apply: (variant) => applyTraceSegments(variant, segments),
    segmentCount: segments.length,
    scaleNote,
  };
}
