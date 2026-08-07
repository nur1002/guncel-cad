// Temel veri modeli. Faz 2 (OpenCV otomatik algılama) için `source` ve `confidence`
// alanları en baştan tüm nesnelerde mevcut — bkz. proje spesifikasyonu §5.

export type ID = string;

/** Bir nesnenin nasıl oluşturulduğu. Faz 1'de her şey "manuel" olur. */
export type Source = "manuel" | "auto-detected" | "confirmed";

export interface Traceable {
  source: Source;
  confidence?: number; // 0..1, sadece auto-detected/confirmed için anlamlı
}

export interface Corner {
  id: ID;
  x: number; // cm, dünya koordinatı
  y: number; // cm
}

export interface Wall extends Traceable {
  id: ID;
  a: ID; // Corner id
  b: ID; // Corner id
  thickness: number; // cm
  malzeme: string; // materials.ts / wallMaterials içindeki id
}

export interface Room extends Traceable {
  id: ID;
  cornerLoop: ID[]; // kapalı döngüyü oluşturan köşe id'leri, sırayla
  wallLoop: ID[]; // kapalı döngüyü oluşturan duvar id'leri, sırayla
  typeId: string; // roomTypes config'ine referans
  name: string; // kullanıcı tarafından değiştirilebilir etiket
  height: number; // cm, duvar/oda yüksekliği (3B extrusion için)
  zeminMalzemesi: string; // materials.ts / floorMaterials içindeki id
  bagimsizBolumId?: ID; // bu oda bir Bağımsız Bölüme aitse (§4.4)
  manuelAlanM2?: number; // "Alan Yaz" ile elle girilen alan; poligondan hesabı geçersiz kılar
}

/**
 * Bağımsız Bölüm (§4.4): tapuda ayrı birim oluşturan daire/dükkan.
 * Bir BB birden çok odayı gruplar; toplam alanı odalarından hesaplanır.
 */
export interface BagimsizBolum {
  id: ID;
  kod: string; // örn. "-1_-1_1"
  kat: string; // örn. "ZEMİN"
  tip: "MSKN" | "TIC"; // Mesken / Ticari
  odaIds: ID[];
  projeNotu?: string;
}

export type ComponentAttributeValue = string | number | boolean;

/** Duvara monte bileşen (pencere, kapı, priz, anahtar, aydınlatma...). */
export interface WallPlacement {
  kind: "duvar";
  duvarId: ID;
  offsetCm: number; // duvarın "a" ucundan itibaren mesafe
}

/** Zemine serbestçe yerleştirilen bileşen (mobilya vb.). */
export interface FloorPlacement {
  kind: "zemin";
  x: number; // cm, dünya koordinatı
  y: number;
  rotationDeg: number;
}

export type ComponentPlacement = WallPlacement | FloorPlacement;

export interface PlacedComponent extends Traceable {
  id: ID;
  tip: string; // kategori id (örn. "pencere", "kapi", "mobilya")
  altTip: string; // katalogdan seçilen alt tip id
  konum: ComponentPlacement;
  oznitelikler: Record<string, ComponentAttributeValue>;
}

export interface TextAnnotation {
  id: ID;
  x: number;
  y: number;
  text: string;
}

/** Taranmış kroki/plan görseli (jpg/png/pdf) — üzerinden çizim yapmak için izleme katmanı. */
export interface BackgroundImage {
  dataUrl: string;
  xCm: number; // sol-üst köşenin dünya koordinatı
  yCm: number;
  widthCm: number;
  heightCm: number;
  opacity: number; // 0..1
  locked: boolean; // kilitliyken canvas'ta seçilip taşınamaz
}

/**
 * DWG/DXF içe aktarımından gelen, YORUMLANMAMIŞ ham çizgi kroki katmanı (§ "otomatik
 * tanıma yapmasın, dosyayı olduğu gibi açsın"). Wall/Corner/Room nesnesi ÜRETİLMEZ —
 * yalnızca dosyadaki çizgiler aynen, ince referans çizgileri olarak gösterilir; duvar/oda
 * algılamasına girmez. Kullanıcı isterse üzerinden elle çizer.
 *
 * Yerleştirme akışı (§ "Bounding box → parsel merkezi → sürükle → döndür → Parsele
 * Yerleştir"): `segments` krokinin KENDİ bbox MERKEZİNE göre yerel koordinatlardır
 * (0,0 = merkez); `x,y,rotationDeg,scale` bu merkezin dünyadaki konum/açı/ölçek
 * dönüşümüdür. `locked=false` iken tuvalde sürüklenip döndürülebilir; "Parsele
 * Yerleştir" ile `locked=true` olur ve dönüşüm projeye (undo/redo'ya) kaydedilmiş olur.
 */
export interface VectorTrace {
  segments: { a: { x: number; y: number }; b: { x: number; y: number } }[];
  widthCm: number; // yerel bbox genişliği (rotasyon/ölçek uygulanmadan önce)
  heightCm: number;
  x: number; // bbox merkezinin dünya konumu
  y: number;
  rotationDeg: number;
  scale: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface ParselInfo {
  areaM2: number; // m² (örn. 5000)
  widthCm: number; // cm (örn. 10000 = 100m)
  lengthCm: number; // cm (örn. 5000 = 50m)
  originX: number; // 0
  originY: number; // 0
}

export interface FloorVariantData {
  id: ID;
  name: string; // "Düzen 1"
  corners: Record<ID, Corner>;
  walls: Record<ID, Wall>;
  rooms: Record<ID, Room>;
  components: Record<ID, PlacedComponent>;
  textAnnotations: Record<ID, TextAnnotation>;
  backgroundImage: BackgroundImage | null;
  vectorTrace: VectorTrace | null;
  bagimsizBolumler: Record<ID, BagimsizBolum>;
}

export interface Page {
  id: ID;
  name: string; // "Zemin Kat", "Sığınak", "1. Kat", "Çatı"
  pageType: string; // "siginak", "otopark", "dukkan", "zemin", "konut", "cati", "teknik"
  kotElevationCm: number; // Kot Z (cm), örn. -400, -150, 0, 300, 600, 900
  heightCm: number; // Yükseklik (cm), örn. 300, 280, 250
  visible: boolean;
  locked: boolean;
  opacity: number; // Şeffaflık (0.2, 0.4, 0.6, 1.0)
  anchorPoint: { x: number; y: number }; // Referans Noktası (varsayılan: 0,0)
  drawing: FloorVariantData;
}

export interface Floor {
  id: ID;
  name: string; // "Kat 1"
  variants: FloorVariantData[];
}

let idCounter = 0;
export function makeId(prefix: string): ID {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function emptyVariant(name: string): FloorVariantData {
  return {
    id: makeId("variant"),
    name,
    corners: {},
    walls: {},
    rooms: {},
    components: {},
    textAnnotations: {},
    backgroundImage: null,
    vectorTrace: null,
    bagimsizBolumler: {},
  };
}

export function createEmptyPage(
  name: string,
  pageType: string,
  kotElevationCm: number,
  heightCm = 300
): Page {
  return {
    id: makeId("page"),
    name,
    pageType,
    kotElevationCm,
    heightCm,
    visible: true,
    locked: false,
    opacity: 1.0,
    anchorPoint: { x: 0, y: 0 },
    drawing: emptyVariant(name),
  };
}

export function clonePage(
  sourcePage: Page,
  newName: string,
  newKotElevationCm: number
): Page {
  return {
    id: makeId("page"),
    name: newName,
    pageType: sourcePage.pageType,
    kotElevationCm: newKotElevationCm,
    heightCm: sourcePage.heightCm,
    visible: true,
    locked: false,
    opacity: 1.0,
    anchorPoint: { ...sourcePage.anchorPoint },
    drawing: cloneVariant(sourcePage.drawing, newName),
  };
}

export function emptyFloor(name: string): Floor {
  return {
    id: makeId("floor"),
    name,
    variants: [emptyVariant("Düzen 1")],
  };
}

/**
 * Bir düzeni tamamen bağımsız yeni id'lerle klonlar. Yeni kat eklerken alt katın
 * tüm bina gövdesiyle (duvar/oda/bileşen) başlaması, ardından kullanıcının iç mekanı
 * (oda tipleri, malzemeler, mobilya vb.) serbestçe değiştirebilmesi için kullanılır.
 */
export function cloneVariant(variant: FloorVariantData, name: string): FloorVariantData {
  const cornerIdMap = new Map<ID, ID>();
  const corners: Record<ID, Corner> = {};
  for (const c of Object.values(variant.corners)) {
    const newId = makeId("corner");
    cornerIdMap.set(c.id, newId);
    corners[newId] = { ...c, id: newId };
  }

  const wallIdMap = new Map<ID, ID>();
  const walls: Record<ID, Wall> = {};
  for (const w of Object.values(variant.walls)) {
    const newId = makeId("wall");
    wallIdMap.set(w.id, newId);
    walls[newId] = { ...w, id: newId, a: cornerIdMap.get(w.a)!, b: cornerIdMap.get(w.b)! };
  }

  const roomIdMap = new Map<ID, ID>();
  const rooms: Record<ID, Room> = {};
  for (const r of Object.values(variant.rooms)) {
    const newId = makeId("room");
    roomIdMap.set(r.id, newId);
    rooms[newId] = {
      ...r,
      id: newId,
      cornerLoop: r.cornerLoop.map((id) => cornerIdMap.get(id)!),
      wallLoop: r.wallLoop.map((id) => wallIdMap.get(id)!),
    };
  }

  const bagimsizBolumler: Record<ID, BagimsizBolum> = {};
  for (const bb of Object.values(variant.bagimsizBolumler)) {
    const newId = makeId("bb");
    bagimsizBolumler[newId] = { ...bb, id: newId, odaIds: bb.odaIds.map((id) => roomIdMap.get(id)!).filter(Boolean) };
    for (const oldRoomId of bb.odaIds) {
      const newRoomId = roomIdMap.get(oldRoomId);
      if (newRoomId && rooms[newRoomId]) rooms[newRoomId].bagimsizBolumId = newId;
    }
  }

  const components: Record<ID, PlacedComponent> = {};
  for (const c of Object.values(variant.components)) {
    const newId = makeId("comp");
    const konum: ComponentPlacement =
      c.konum.kind === "duvar" ? { ...c.konum, duvarId: wallIdMap.get(c.konum.duvarId)! } : { ...c.konum };
    components[newId] = { ...c, id: newId, konum };
  }

  const textAnnotations: Record<ID, TextAnnotation> = {};
  for (const t of Object.values(variant.textAnnotations)) {
    const newId = makeId("text");
    textAnnotations[newId] = { ...t, id: newId };
  }

  // Arka plan izleme görseli katlar arasında kopyalanmaz — her kat kendi taranmış
  // planıyla (veya hiç görsel olmadan) başlar.
  return {
    id: makeId("variant"),
    name,
    corners,
    walls,
    rooms,
    components,
    textAnnotations,
    backgroundImage: null,
    vectorTrace: null,
    bagimsizBolumler,
  };
}
