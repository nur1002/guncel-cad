// Plan kalite kontrol denetimleri (§4.6). Hepsi saf fonksiyon: variant alır,
// bulguları döner; hiçbir şeyi değiştirmez.

import type { FloorVariantData, ID } from "../../data/model";
import { dist, projectPointToSegment } from "../drawing/geometry";

export interface QaFinding {
  kind: "acik_uc" | "cakisan_duvar" | "kapisiz_oda" | "sifir_uzunluk";
  mesaj: string;
  ids: ID[];
}

/**
 * Topoloji Kontrol: kapanmayan poligon (tek uçlu köşe), çakışan/üst üste binen
 * duvarlar ve sıfıra yakın uzunlukta duvarlar.
 */
export function runTopologyCheck(variant: FloorVariantData): QaFinding[] {
  const findings: QaFinding[] = [];

  // 1) Açık uç: bir köşeye yalnızca tek duvar bağlanıyorsa poligon kapanmamıştır
  const derece = new Map<ID, number>();
  for (const w of Object.values(variant.walls)) {
    derece.set(w.a, (derece.get(w.a) ?? 0) + 1);
    derece.set(w.b, (derece.get(w.b) ?? 0) + 1);
  }
  const acikUclar = [...derece.entries()].filter(([, d]) => d === 1).map(([id]) => id);
  if (acikUclar.length > 0) {
    findings.push({
      kind: "acik_uc",
      mesaj: `${acikUclar.length} adet açık uç (kapanmamış köşe) bulundu.`,
      ids: acikUclar,
    });
  }

  // 2) Sıfır/çok kısa duvarlar
  const kisaDuvarlar = Object.values(variant.walls)
    .filter((w) => {
      const a = variant.corners[w.a];
      const b = variant.corners[w.b];
      return a && b && dist(a, b) < 5;
    })
    .map((w) => w.id);
  if (kisaDuvarlar.length > 0) {
    findings.push({
      kind: "sifir_uzunluk",
      mesaj: `${kisaDuvarlar.length} adet çok kısa (5 cm'den küçük) duvar bulundu.`,
      ids: kisaDuvarlar,
    });
  }

  // 3) Çakışan duvarlar: iki duvar neredeyse aynı hat üzerinde ve örtüşüyorsa
  const duvarlar = Object.values(variant.walls);
  const cakisanlar: ID[] = [];
  for (let i = 0; i < duvarlar.length; i++) {
    for (let j = i + 1; j < duvarlar.length; j++) {
      const w1 = duvarlar[i];
      const w2 = duvarlar[j];
      const a1 = variant.corners[w1.a];
      const b1 = variant.corners[w1.b];
      const a2 = variant.corners[w2.a];
      const b2 = variant.corners[w2.b];
      if (!a1 || !b1 || !a2 || !b2) continue;
      // Ortak köşeleri varsa bu normal bir birleşimdir, çakışma değil
      if (w1.a === w2.a || w1.a === w2.b || w1.b === w2.a || w1.b === w2.b) continue;
      // İki ucu da diğer duvara çok yakınsa örtüşüyor demektir
      const d1 = projectPointToSegment(a2, a1, b1).distance;
      const d2 = projectPointToSegment(b2, a1, b1).distance;
      if (d1 < 3 && d2 < 3) {
        cakisanlar.push(w1.id, w2.id);
      }
    }
  }
  if (cakisanlar.length > 0) {
    findings.push({
      kind: "cakisan_duvar",
      mesaj: `${cakisanlar.length / 2} çift çakışan/üst üste binen duvar bulundu.`,
      ids: [...new Set(cakisanlar)],
    });
  }

  return findings;
}

/** Eksik Kapılar: duvar döngüsünde hiç kapı bulunmayan odaları işaretler (§4.6). */
export function runMissingDoorCheck(variant: FloorVariantData): QaFinding[] {
  const kapisiz: ID[] = [];
  for (const room of Object.values(variant.rooms)) {
    const kapiVar = Object.values(variant.components).some(
      (c) => c.tip === "kapi" && c.konum.kind === "duvar" && room.wallLoop.includes(c.konum.duvarId)
    );
    if (!kapiVar) kapisiz.push(room.id);
  }
  if (kapisiz.length === 0) return [];
  return [
    {
      kind: "kapisiz_oda",
      mesaj: `${kapisiz.length} odada kapı yok (erişilemez olabilir).`,
      ids: kapisiz,
    },
  ];
}
