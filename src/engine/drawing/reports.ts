// Kat/oda alan raporlama yardımcıları. LeftToolRail'in "Raporlar" sekmesi ve
// Stage 3 ("Alan / Yapı Bilgileri") ekranı AYNI bu fonksiyonları kullanır —
// aggregation mantığı iki yerde kopyalanıp birbirinden sapmasın diye tek
// kaynaktan gelir.

import type { Page } from "../../data/model";
import { dist } from "./geometry";
import { roomAreaM2, roomPolygon } from "./render2d";

export interface PageAreaSummary {
  pageId: string;
  pageName: string;
  roomCount: number;
  wallCount: number;
  totalAreaM2: number;
}

export interface RoomReportRow {
  roomId: string;
  roomName: string;
  pageName: string;
  areaM2: number;
  perimeterM: number;
}

export interface TaksKaksResult {
  tabanAlaniM2: number;
  toplamInsaatAlaniM2: number;
  katSayisi: number;
  taks: number;
  kaks: number;
}

function roomPerimeterM(room: Page["drawing"]["rooms"][string], corners: Page["drawing"]["corners"]): number {
  const pts = roomPolygon(room, corners);
  if (pts.length < 2) return 0;
  let sumCm = 0;
  for (let i = 0; i < pts.length; i++) {
    sumCm += dist(pts[i], pts[(i + 1) % pts.length]);
  }
  return sumCm / 100;
}

export function computePageSummaries(pages: Page[]): PageAreaSummary[] {
  return pages.map((p) => {
    const rooms = Object.values(p.drawing.rooms);
    const totalAreaM2 = rooms.reduce((sum, r) => sum + (r.manuelAlanM2 ?? roomAreaM2(r, p.drawing.corners)), 0);
    return {
      pageId: p.id,
      pageName: p.name,
      roomCount: rooms.length,
      wallCount: Object.keys(p.drawing.walls).length,
      totalAreaM2,
    };
  });
}

export function computeRoomRows(pages: Page[]): RoomReportRow[] {
  const rows: RoomReportRow[] = [];
  for (const p of pages) {
    for (const room of Object.values(p.drawing.rooms)) {
      rows.push({
        roomId: room.id,
        roomName: room.name,
        pageName: p.name,
        areaM2: room.manuelAlanM2 ?? roomAreaM2(room, p.drawing.corners),
        perimeterM: roomPerimeterM(room, p.drawing.corners),
      });
    }
  }
  return rows;
}

/**
 * TAKS = Taban Alanı Kat Sayısı oranı = zemin kat taban alanı / parsel alanı.
 * KAKS (Emsal) = Kat Alanı Kat Sayısı oranı = toplam inşaat alanı / parsel alanı.
 * "Zemin kat" — pageType==="zemin" ile eşleşen sayfa, yoksa kotElevationCm===0
 * olan sayfa, o da yoksa ilk sayfa (§ dürüst bir varsayılan, sayfa sırasına
 * kör güvenmek yerine gerçek kat verisine bakar).
 */
export function computeTaksKaks(pages: Page[], parselAreaM2: number): TaksKaksResult {
  const summaries = computePageSummaries(pages);
  const groundPage =
    pages.find((p) => p.pageType === "zemin") ?? pages.find((p) => p.kotElevationCm === 0) ?? pages[0];
  const groundSummary = summaries.find((s) => s.pageId === groundPage?.id);
  const tabanAlaniM2 = groundSummary?.totalAreaM2 ?? 0;
  const toplamInsaatAlaniM2 = summaries.reduce((sum, s) => sum + s.totalAreaM2, 0);
  const katSayisi = pages.length;
  const taks = parselAreaM2 > 0 ? tabanAlaniM2 / parselAreaM2 : 0;
  const kaks = parselAreaM2 > 0 ? toplamInsaatAlaniM2 / parselAreaM2 : 0;
  return { tabanAlaniM2, toplamInsaatAlaniM2, katSayisi, taks, kaks };
}
