// Üst kategori sekmeleri config'i (§3). Aynı zamanda katman anahtarı görevi görür:
// bir sekmenin göz ikonuna tıklanınca o katmandaki nesneler tuvalde gizlenir/gösterilir
// (veri modelinden silinmez). Liste büyüyebilir olmalı — kod içine gömülmez.

export interface CategoryTab {
  id: string;
  label: string;
  // İlgili bileşen kataloğu kategorisi varsa, bu sekme aktifken sağ panel
  // doğrudan o kataloğu öne çıkarır (§6.1).
  catalogCategoryId?: string;
}

export const defaultCategoryTabs: CategoryTab[] = [
  { id: "orijinal_plan", label: "Orijinal plan" },
  { id: "sokme", label: "Sökme" },
  { id: "bolme_duvarlar", label: "Bölme duvarlar" },
  { id: "alanlar", label: "Alanlar" },
  { id: "yapisal", label: "Yapısal (Merdiven/Asansör)", catalogCategoryId: "yapisal" },
  { id: "isitma", label: "Isıtma" },
  { id: "mobilya", label: "Mobilya", catalogCategoryId: "mobilya" },
  { id: "sihhi_tesisat", label: "Sıhhi tesisat", catalogCategoryId: "sihhi_tesisat" },
  { id: "su_tesisati", label: "Su tesisatı" },
  { id: "prizler", label: "Prizler", catalogCategoryId: "prizler" },
  { id: "anahtarlar", label: "Anahtarlar" },
  { id: "aydinlatma", label: "Aydınlatma", catalogCategoryId: "aydinlatma" },
  { id: "kablolama", label: "Kablolama" },
  { id: "elektrik_panosu", label: "Elektrik panosu" },
  { id: "sicak_zemin", label: "Sıcak zemin" },
];
