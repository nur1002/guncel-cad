// Duvar ve zemin malzeme config'i. Oda tipi renklerinde olduğu gibi merkezi bir
// listeden okunur; yeni malzeme eklemek kod değişikliği gerektirmez.

export interface MaterialConfig {
  id: string;
  label: string;
  color: string; // 3B görünümde ve panel örneğinde kullanılan renk
}

export const wallMaterials: MaterialConfig[] = [
  { id: "siva", label: "Sıva (Boyalı)", color: "#E8E4DC" },
  { id: "tugla", label: "Tuğla", color: "#B5651D" },
  { id: "beton", label: "Brüt Beton", color: "#9B9B93" },
  { id: "alcipan", label: "Alçıpan", color: "#F2F0EA" },
  { id: "ahsap_kaplama", label: "Ahşap Kaplama", color: "#8B5E34" },
];

export const floorMaterials: MaterialConfig[] = [
  { id: "parke", label: "Parke", color: "#B8875A" },
  { id: "laminat", label: "Laminat", color: "#C9A576" },
  { id: "fayans", label: "Fayans", color: "#E4E4E0" },
  { id: "seramik", label: "Seramik", color: "#D8D2C4" },
  { id: "mermer", label: "Mermer", color: "#EDEBE6" },
  { id: "hali", label: "Halı", color: "#8A6A54" },
];

export const DEFAULT_WALL_MATERIAL = "siva";
export const DEFAULT_FLOOR_MATERIAL = "parke";

export function getMaterial(list: MaterialConfig[], id: string): MaterialConfig {
  return list.find((m) => m.id === id) ?? list[0];
}
