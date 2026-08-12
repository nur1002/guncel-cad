// CityGML 2.0 (bldg modülü) dışa aktarımı. Her kat bir bldg:BuildingPart olarak,
// duvarlar bldg:WallSurface (pencere/kapı bldg:opening olarak), oda zeminleri/
// tavanları bldg:GroundSurface / bldg:RoofSurface olarak yazılır.
//
// Not: Bu, tam OGC doğrulamasından geçecek topolojik olarak kusursuz bir "solid"
// üretmez (LOD2 çoklu yüzey temsili kullanılır) — ama duvar/pencere/kapı/kat
// verisini gerçek 3B koordinatlarla, standart bldg şeması altında, GIS araçlarının
// (FME, 3DCityDB, QGIS CityGML eklentisi vb.) okuyabileceği geçerli bir XML olarak taşır.

import type { BagimsizBolum, Building, FloorVariantData, Page, PlacedComponent, Room, Wall } from "../../data/model";
import { dist } from "../drawing/geometry";

const CM_TO_M = 0.01;
const DEFAULT_WALL_HEIGHT_M = 2.7;

/**
 * TKGM'nin 3B bina kılavuzunda (cbs.tkgm.gov.tr/3d/html/gml_id_name_class_atamalari.html)
 * her nesne türü için sabit bir gml:id öneki tanımlı (Mimari Bina "MB_", Kat "K_",
 * Bağımsız Bölüm "BB_", duvar yüzeyi "Wall_", çatı "Roof_", taban "Floor_" — hepsi +GUID).
 * Kendi iç id şemamızı (makeId) GUID yerine kullanıyoruz — gerçek GUID'e taşıma § F.
 */
function gmlId(prefix: string, id: string): string {
  return prefix + id;
}

function wallHeightFor(wallId: string, variant: FloorVariantData): number {
  for (const room of Object.values(variant.rooms)) {
    if (room.wallLoop.includes(wallId)) return (room.height * CM_TO_M) || DEFAULT_WALL_HEIGHT_M;
  }
  return DEFAULT_WALL_HEIGHT_M;
}

function posList(points: [number, number, number][]): string {
  return points.map((p) => p.map((n) => n.toFixed(3)).join(" ")).join(" ");
}

function polygonMember(id: string, ring: [number, number, number][]): string {
  const closedRing = [...ring, ring[0]];
  return `<gml:surfaceMember><gml:Polygon gml:id="${id}"><gml:exterior><gml:LinearRing><gml:posList srsDimension="3">${posList(
    closedRing
  )}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember>`;
}

function multiSurface(id: string, members: string): string {
  return `<bldg:lod2MultiSurface><gml:MultiSurface gml:id="ms_${id}">${members}</gml:MultiSurface></bldg:lod2MultiSurface>`;
}

function wallOpeningXml(comp: PlacedComponent, a: { x: number; y: number }, b: { x: number; y: number }, baseZ: number): string {
  if (comp.konum.kind !== "duvar") return "";
  const wallLen = dist(a, b);
  if (wallLen < 1) return "";
  const dirX = (b.x - a.x) / wallLen;
  const dirY = (b.y - a.y) / wallLen;
  const width = Number(comp.oznitelikler["genislik"] ?? 80);
  const height = Number(comp.oznitelikler["yukseklik"] ?? (comp.tip === "kapi" ? 210 : 120));
  const sill = comp.tip === "pencere" ? Number(comp.oznitelikler["yukseklik_zeminden"] ?? 90) : 0;

  const c = comp.konum.offsetCm;
  const p1 = { x: a.x + dirX * (c - width / 2), y: a.y + dirY * (c - width / 2) };
  const p2 = { x: a.x + dirX * (c + width / 2), y: a.y + dirY * (c + width / 2) };
  const z0 = baseZ + sill * CM_TO_M;
  const z1 = baseZ + (sill + height) * CM_TO_M;

  const ring: [number, number, number][] = [
    [p1.x * CM_TO_M, p1.y * CM_TO_M, z0],
    [p2.x * CM_TO_M, p2.y * CM_TO_M, z0],
    [p2.x * CM_TO_M, p2.y * CM_TO_M, z1],
    [p1.x * CM_TO_M, p1.y * CM_TO_M, z1],
  ];
  const tag = comp.tip === "kapi" ? "Door" : "Window";
  const ms = multiSurface(comp.id, polygonMember(`poly_${comp.id}`, ring));
  return `<bldg:opening><bldg:${tag} gml:id="${tag.toLowerCase()}_${comp.id}">${ms}</bldg:${tag}></bldg:opening>`;
}

function wallSurfaceXml(wall: Wall, variant: FloorVariantData, baseZ: number): string {
  const a = variant.corners[wall.a];
  const b = variant.corners[wall.b];
  if (!a || !b) return "";
  const wallLen = dist(a, b);
  if (wallLen < 1) return "";
  const height = wallHeightFor(wall.id, variant);
  const z0 = baseZ;
  const z1 = baseZ + height;

  const ring: [number, number, number][] = [
    [a.x * CM_TO_M, a.y * CM_TO_M, z0],
    [b.x * CM_TO_M, b.y * CM_TO_M, z0],
    [b.x * CM_TO_M, b.y * CM_TO_M, z1],
    [a.x * CM_TO_M, a.y * CM_TO_M, z1],
  ];
  const ms = multiSurface(wall.id, polygonMember(`poly_${wall.id}`, ring));

  const openings = Object.values(variant.components)
    .filter((c) => c.konum.kind === "duvar" && c.konum.duvarId === wall.id && (c.tip === "kapi" || c.tip === "pencere"))
    .map((c) => wallOpeningXml(c, a, b, baseZ))
    .join("");

  return `<bldg:boundedBy><bldg:WallSurface gml:id="${gmlId("Wall_", wall.id)}">${ms}${openings}</bldg:WallSurface></bldg:boundedBy>`;
}

function roomSurfacesXml(roomId: string, variant: FloorVariantData, baseZ: number): string {
  const room = variant.rooms[roomId];
  const poly = room.cornerLoop.map((id) => variant.corners[id]).filter(Boolean);
  if (poly.length < 3) return "";
  const heightM = (room.height * CM_TO_M) || DEFAULT_WALL_HEIGHT_M;

  const groundRing: [number, number, number][] = poly.map((p) => [p.x * CM_TO_M, p.y * CM_TO_M, baseZ]);
  const roofRing: [number, number, number][] = [...poly].reverse().map((p) => [p.x * CM_TO_M, p.y * CM_TO_M, baseZ + heightM]);

  const ground = `<bldg:boundedBy><bldg:GroundSurface gml:id="${gmlId("Floor_", room.id)}">${multiSurface(
    `ground_${room.id}`,
    polygonMember(`poly_ground_${room.id}`, groundRing)
  )}</bldg:GroundSurface></bldg:boundedBy>`;
  const roof = `<bldg:boundedBy><bldg:RoofSurface gml:id="${gmlId("Roof_", room.id)}">${multiSurface(
    `roof_${room.id}`,
    polygonMember(`poly_roof_${room.id}`, roofRing)
  )}</bldg:RoofSurface></bldg:boundedBy>`;
  return ground + roof;
}

/**
 * TKGM'de "Kısım" ayrı bir nesne değil, doğrudan bldg:Room'dur (bkz. bagimsiz_bolum_kisim.html)
 * ve Bağımsız Bölüme bağlantısı `independentSectionObjectReference` stringAttribute'u ile
 * kurulur. Mevcut zemin/çatı yüzeyleri (roomSurfacesXml) BuildingPart seviyesinde
 * boundedBy olarak kalmaya devam ediyor (§ dokunulmuyor — geometriyi bozmamak için);
 * bu fonksiyon SADECE Room'un kimliğini ve varsa BB referansını taşıyan ayrı, küçük bir
 * bldg:interiorRoom/bldg:Room elemanı üretir. Room'un kendi iç yüzeyleri (InteriorWallSurface/
 * FloorSurface/CeilSurface, TKGM'nin lod4MultiSurface'ı) bu turda üretilmiyor (§ F).
 */
function roomIdentityXml(room: Room): string {
  const bbRef = room.bagimsizBolumId
    ? `<gen:stringAttribute name="independentSectionObjectReference"><gen:value>${escapeXml(
        gmlId("BB_", room.bagimsizBolumId)
      )}</gen:value></gen:stringAttribute>`
    : "";
  return `<bldg:interiorRoom><bldg:Room gml:id="${gmlId("Room_", room.id)}"><gml:name>${escapeXml(
    room.name
  )}</gml:name>${bbRef}</bldg:Room></bldg:interiorRoom>`;
}

/**
 * Bağımsız Bölüm CityGML'de `bldg:BuildingUnit` DEĞİL, generics şemasından
 * `gen:GenericCityObject`'tir (bkz. bagimsiz_bolum.html) — Building/BuildingPart'ın
 * İÇİNE gömülmez, CityModel kökünde Building ile KARDEŞ bir cityObjectMember olarak
 * durur; Kısım'a (Room) bağlantı stringAttribute referansıyla kurulur (yukarıdaki
 * roomIdentityXml). Zorunlu TKGM öznitelikleri: independentSectionNumber (=bb.kod),
 * independentSectionUsage (=bb.tip); geri kalanı (takbis no, plan alanları vb.)
 * veri modelinde yer ayrılmış ama henüz UI'dan doldurulmuyor (§ F) — varsa yazılır,
 * yoksa atlanır.
 */
function bagimsizBolumXml(bb: BagimsizBolum): string {
  const attrs: [string, string | number | undefined][] = [
    ["independentSectionNumber", bb.kod],
    ["independentSectionUsage", bb.tip],
    ["takbisPropertyIdentityNumber", bb.takbisPropertyIdentityNumber],
    ["independentSectionPlanNetArea", bb.planNetAreaM2],
    ["independentSectionPlanGrossArea", bb.planGrossAreaM2],
    ["independentSectionCardinalDirection", bb.cardinalDirection],
    ["additionalNote", bb.additionalNote],
  ];
  const stringAttrs = attrs
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([name, v]) =>
        `<gen:stringAttribute name="${name}"><gen:value>${escapeXml(String(v))}</gen:value></gen:stringAttribute>`
    )
    .join("");
  return `<core:cityObjectMember><gen:GenericCityObject gml:id="${gmlId("BB_", bb.id)}"><gml:name>${escapeXml(
    bb.kod
  )} Bağımsız Bölüm</gml:name>${stringAttrs}</gen:GenericCityObject></core:cityObjectMember>`;
}

function buildingPartXml(page: Page, baseZ: number): { xml: string; heightM: number } {
  const variant = page.drawing;
  const roomHeights = Object.values(variant.rooms).map((r) => r.height * CM_TO_M);
  const floorHeightM = roomHeights.length > 0 ? Math.max(...roomHeights) : DEFAULT_WALL_HEIGHT_M;

  const walls = Object.values(variant.walls)
    .map((w) => wallSurfaceXml(w, variant, baseZ))
    .join("");
  const rooms = Object.values(variant.rooms)
    .map((r) => roomSurfacesXml(r.id, variant, baseZ) + roomIdentityXml(r))
    .join("");

  const xml = `<bldg:consistsOfBuildingPart><bldg:BuildingPart gml:id="${gmlId("K_", page.id)}"><gml:name>${escapeXml(
    page.name
  )}</gml:name><bldg:function>1000</bldg:function><bldg:measuredHeight uom="m">${floorHeightM.toFixed(
    2
  )}</bldg:measuredHeight>${walls}${rooms}</bldg:BuildingPart></bldg:consistsOfBuildingPart>`;

  return { xml, heightM: floorHeightM };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Gerçek çizim verisinden (`pages`, aktif projenin tek doğru kaynağı — bkz. TKGM veri
 * modeli analizi, 2026-08-11) CityGML üretir. Önceden bu fonksiyon hiç güncellenmeyen
 * ölü bir `floors` state'inden besleniyordu ve her zaman boş bina üretiyordu; artık
 * doğrudan `pages`'i alıyor.
 */
export function exportProjectAsCityGml(pages: Page[], building: Building): string {
  const orderedPages = [...pages].sort((a, b) => a.kotElevationCm - b.kotElevationCm);

  let baseZ = 0;
  const parts: string[] = [];
  for (const page of orderedPages) {
    const { xml, heightM } = buildingPartXml(page, baseZ);
    parts.push(xml);
    baseZ += heightM;
  }
  const totalHeight = baseZ;

  const bbMembers = orderedPages
    .flatMap((page) => Object.values(page.drawing.bagimsizBolumler))
    .map((bb) => bagimsizBolumXml(bb))
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:gen="http://www.opengis.net/citygml/generics/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<gml:name>${escapeXml(building.name)}</gml:name>
<core:cityObjectMember>
<bldg:Building gml:id="${gmlId("MB_", building.id)}">
<gml:name>${escapeXml(building.name)}</gml:name>
<bldg:function>1000</bldg:function>
<bldg:measuredHeight uom="m">${totalHeight.toFixed(2)}</bldg:measuredHeight>
${parts.join("\n")}
</bldg:Building>
</core:cityObjectMember>
${bbMembers}
</core:CityModel>
`;
}
