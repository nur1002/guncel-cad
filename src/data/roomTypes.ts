// Bölge/alan tipi config'i (§4.4). bilCAD'deki yapıyla hizalı olarak üç kategori var:
//   1. Bağımsız Bölüm (BB) — tapuda ayrı birim oluşturan mekânlar (daire/dükkan içi odalar)
//   2. Ortak Alan       — binaya ait, hiçbir BB'ye ait olmayan alanlar
//   3. Diğer Bileşen    — oda olmayan, nokta/çizgi bazlı yapı elemanları
//
// ~37 tip olduğu için renkler elle seçilmez; HSL çemberinde algoritmik olarak dağıtılır
// (§9). Her tip iki renk taşır:
//   - `color`    : tuvalde oda dolgusu için soluk/pastel ton (metin okunur kalsın diye)
//   - `dotColor` : sol paletteki renk çipi için doygun ton (tipler bir bakışta ayrışsın)

export type RoomCategory = "bagimsiz_bolum" | "ortak_alan" | "diger_bilesen";

export interface RoomTypeConfig {
  id: string;
  label: string;
  /** Sol paletteki dar çiplere sığan kısa ad (örn. "Kalorifer Dairesi" → "Kalorifer D."). */
  shortLabel: string;
  category: RoomCategory;
  color: string; // oda dolgusu (pastel)
  dotColor: string; // palet çipi (doygun)
}

export const roomCategoryLabels: Record<RoomCategory, string> = {
  bagimsiz_bolum: "Bağımsız Bölüm",
  ortak_alan: "Ortak Alanlar",
  diger_bilesen: "Diğer Bileşenler",
};

export const roomCategoryOrder: RoomCategory[] = ["bagimsiz_bolum", "ortak_alan", "diger_bilesen"];

/**
 * Kategoriye göre HSL tabanlı renk üretir. Her kategori kendi hue aralığında kalır;
 * `vivid` true ise palet çipi için doygun/koyu, false ise oda dolgusu için soluk ton döner.
 */
export function generateTypeColor(
  category: RoomCategory,
  index: number,
  total: number,
  vivid = false
): string {
  const band: Record<RoomCategory, { hueStart: number; hueSpan: number }> = {
    bagimsiz_bolum: { hueStart: 20, hueSpan: 300 },
    ortak_alan: { hueStart: 175, hueSpan: 180 },
    diger_bilesen: { hueStart: 200, hueSpan: 160 },
  };
  const b = band[category];
  const hue = Math.round(b.hueStart + (total > 1 ? (index * b.hueSpan) / total : 0)) % 360;
  // Doygunluğu düşük ince CAD çizgileri üretir
  return vivid ? hslToHex(hue, 60, 50) : hslToHex(hue, 45, 60);
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const color = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// --- Tip listeleri (§4.4). [id, tam etiket, kısa etiket]; renkler otomatik atanır. ---

const bagimsizBolumTipleri = [
  ["oda", "Oda", "Oda"],
  ["banyo", "Banyo", "Banyo"],
  ["salon", "Salon", "Salon"],
  ["mutfak", "Mutfak", "Mutfak"],
  ["yatak_odasi", "Yatak Odası", "Yatak O."],
  ["antre", "Antre", "Antre"],
  ["kiler", "Kiler", "Kiler"],
  ["tuvalet", "Tuvalet", "Tuvalet"],
  ["kis_bahcesi", "Kış Bahçesi", "Kış Bahçesi"],
  ["hol", "Hol", "Hol"],
  ["dukkan", "Dükkan", "Dükkan"],
  ["balkon", "Balkon", "Balkon"],
  ["teras", "Teras", "Teras"],
] as const;

const ortakAlanTipleri = [
  ["siginak", "Sığınak", "Sığınak"],
  ["danisma", "Danışma", "Danışma"],
  ["kalorifer_dairesi", "Kalorifer Dairesi", "Kalorifer D."],
  ["kapici_dairesi", "Kapıcı Dairesi", "Kapıcı D."],
  ["elektrik_merkezi", "Elektrik Merkezi", "Elektrik M."],
  ["isi_merkezi", "Isı Merkezi", "Isı Merkezi"],
  ["otopark", "Otopark", "Otopark"],
  ["guvenlik_odasi", "Güvenlik Odası", "Güvenlik O."],
  ["havuz", "Havuz", "Havuz"],
  ["sosyal_tesis", "Sosyal Tesis", "Sosyal Tesis"],
  ["spor_salonu", "Spor Salonu", "Spor Salonu"],
  ["cop_odasi", "Çöp Odası", "Çöp Odası"],
  ["noa", "NOA (Net Oturum Alanı)", "NOA"],
  ["merdiven_ortak", "Merdiven", "Merdiven"],
  ["su_merkezi", "Su Merkezi", "Su Merkezi"],
  ["dini_tesis", "Dini Tesis", "Dini Tesis"],
  ["mustemilat", "Müştemilat", "Müştemilat"],
  ["teknik_hacim", "Teknik Hacim", "Teknik Hac."],
] as const;

// "bina_dis_siniri" artık burada YOK — gerçek bir BuildingOutline nesnesi/aracı var
// (§ Wall/Room/BuildingOutline semantik ayrımı, 2026-08-11); Room-tipi olarak kalması
// "her şeyi Room yap" hatasının ta kendisiydi.
const digerBilesenTipleri = [
  ["cati", "Çatı", "Çatı"],
  ["kapi_bilesen", "Kapı", "Kapı"],
  ["pencere_bilesen", "Pencere", "Pencere"],
  ["ic_asansor", "İç Asansör", "İç Asansör"],
  ["ic_merdiven", "İç Merdiven", "İç Merdiven"],
  ["yangin_merdiveni", "Yangın Merdiveni", "Yangın M."],
  ["kolon", "Kolon", "Kolon"],
] as const;

function buildTypes(
  entries: readonly (readonly [string, string, string])[],
  category: RoomCategory
): RoomTypeConfig[] {
  return entries.map(([id, label, shortLabel], i) => ({
    id,
    label,
    shortLabel,
    category,
    color: generateTypeColor(category, i, entries.length, false),
    dotColor: generateTypeColor(category, i, entries.length, true),
  }));
}

export const defaultRoomTypes: RoomTypeConfig[] = [
  ...buildTypes(bagimsizBolumTipleri, "bagimsiz_bolum"),
  ...buildTypes(ortakAlanTipleri, "ortak_alan"),
  ...buildTypes(digerBilesenTipleri, "diger_bilesen"),
];

/** Yeni kullanıcı tipi eklendiğinde o kategorideki mevcut sayıya göre renk üretir. */
export function colorForNewRoomType(
  existingInCategory: number,
  category: RoomCategory = "bagimsiz_bolum",
  vivid = false
): string {
  // Altın oran adımıyla dağıt: kategori dolsa bile renkler çakışmasın.
  return generateTypeColor(category, existingInCategory * 7 + 3, 24, vivid);
}

export const DEFAULT_ROOM_TYPE_ID = "oda";

export function getRoomType(roomTypes: RoomTypeConfig[], typeId: string): RoomTypeConfig {
  return (
    roomTypes.find((r) => r.id === typeId) ||
    roomTypes.find((r) => r.id === "oda") || {
      id: typeId,
      label: typeId,
      shortLabel: typeId,
      category: "bagimsiz_bolum",
      color: "#e2e8f0",
      dotColor: "#64748b",
    }
  );
}
