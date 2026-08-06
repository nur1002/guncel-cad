// Bileşen kataloğu config'i (§6). Kod içine gömülü switch/case yerine bu listeden
// okunur — yeni bir kategori veya alt tip eklemek kod değişikliği gerektirmez.

export type AttributeFieldType = "number" | "text" | "select";

export interface AttributeFieldSchema {
  key: string;
  label: string;
  type: AttributeFieldType;
  unit?: string;
  options?: string[];
  default: string | number;
}

export interface CatalogSubtype {
  id: string;
  label: string;
  icon: string; // basit sembol (demo amaçlı, ileride SVG/ikon setiyle değiştirilebilir)
  attributes: AttributeFieldSchema[];
}

export type PlacementKind = "duvar" | "zemin";

export interface CatalogCategory {
  id: string; // aynı zamanda bileşenin "tip" alanı ve katman anahtarı
  label: string;
  /** "duvar": pencere/kapı/priz gibi bir duvar üzerine yerleştirilir.
   *  "zemin": mobilya gibi odanın içine serbestçe yerleştirilir. */
  placement: PlacementKind;
  subtypes: CatalogSubtype[];
}

const pencereOznitelikleri = (genislik: number, yukseklik: number): AttributeFieldSchema[] => [
  { key: "genislik", label: "Genişlik", type: "number", unit: "cm", default: genislik },
  { key: "yukseklik", label: "Yükseklik", type: "number", unit: "cm", default: yukseklik },
  { key: "yukseklik_zeminden", label: "Denizlik (Zeminden Yükseklik)", type: "number", unit: "cm", default: 90 },
  { key: "kasa_rengi", label: "Kasa Rengi", type: "select", options: ["Beyaz", "Antrasit", "Ahşap Desen"], default: "Beyaz" },
  { key: "cam_tipi", label: "Cam Tipi", type: "select", options: ["Isıcam", "Lamine", "Buzlu"], default: "Isıcam" },
];

const kapiOznitelikleri = (genislik: number, yukseklik: number): AttributeFieldSchema[] => [
  { key: "genislik", label: "Genişlik", type: "number", unit: "cm", default: genislik },
  { key: "yukseklik", label: "Yükseklik", type: "number", unit: "cm", default: yukseklik },
  { key: "malzeme", label: "Malzeme", type: "select", options: ["Ahşap", "Çelik", "Cam", "PVC"], default: "Ahşap" },
  { key: "acilis_yonu", label: "Açılış Yönü", type: "select", options: ["Sol", "Sağ", "İçe", "Dışa"], default: "Sol" },
];

const mobilyaOznitelikleri = (genislik: number, derinlik: number, yukseklik: number): AttributeFieldSchema[] => [
  { key: "genislik", label: "Genişlik", type: "number", unit: "cm", default: genislik },
  { key: "derinlik", label: "Derinlik", type: "number", unit: "cm", default: derinlik },
  { key: "yukseklik", label: "Yükseklik", type: "number", unit: "cm", default: yukseklik },
  { key: "renk", label: "Renk", type: "select", options: ["Ahşap Desen", "Beyaz", "Antrasit", "Bej"], default: "Ahşap Desen" },
];

export const defaultCatalog: CatalogCategory[] = [
  {
    id: "pencere",
    label: "Pencere",
    placement: "duvar",
    subtypes: [
      { id: "tek_kanat", label: "Tek Kanat", icon: "▯", attributes: pencereOznitelikleri(100, 120) },
      { id: "cift_kanat", label: "Çift Kanat", icon: "▯▯", attributes: pencereOznitelikleri(160, 120) },
      { id: "uc_bolmeli", label: "Üç Bölmeli", icon: "▯▯▯", attributes: pencereOznitelikleri(220, 120) },
      { id: "surme", label: "Sürme", icon: "▭", attributes: pencereOznitelikleri(180, 140) },
      { id: "vasistas", label: "Vasistas", icon: "▬", attributes: pencereOznitelikleri(60, 50) },
    ],
  },
  {
    id: "kapi",
    label: "Kapı",
    placement: "duvar",
    subtypes: [
      { id: "tek_kanat_kapi", label: "Tek Kanat", icon: "▮", attributes: kapiOznitelikleri(90, 210) },
      { id: "cift_kanat_kapi", label: "Çift Kanat", icon: "▮▮", attributes: kapiOznitelikleri(150, 210) },
      { id: "surme_kapi", label: "Sürme", icon: "▭", attributes: kapiOznitelikleri(120, 210) },
      { id: "balkon_kapisi", label: "Balkon Kapısı", icon: "▯", attributes: kapiOznitelikleri(120, 220) },
    ],
  },
  {
    id: "mobilya",
    label: "Mobilya",
    placement: "zemin",
    subtypes: [
      { id: "koltuk", label: "Koltuk", icon: "🛋️", attributes: mobilyaOznitelikleri(180, 90, 85) },
      { id: "tekli_koltuk", label: "Tekli Koltuk", icon: "🪑", attributes: mobilyaOznitelikleri(80, 80, 85) },
      { id: "yemek_masasi", label: "Yemek Masası", icon: "▦", attributes: mobilyaOznitelikleri(140, 90, 75) },
      { id: "sandalye", label: "Sandalye", icon: "🪑", attributes: mobilyaOznitelikleri(45, 45, 90) },
      { id: "yatak_tek", label: "Tek Kişilik Yatak", icon: "▤", attributes: mobilyaOznitelikleri(100, 200, 50) },
      { id: "yatak_cift", label: "Çift Kişilik Yatak", icon: "▤", attributes: mobilyaOznitelikleri(160, 200, 50) },
      { id: "gardirop", label: "Gardırop", icon: "▥", attributes: mobilyaOznitelikleri(120, 60, 220) },
      { id: "tv_unitesi", label: "TV Ünitesi", icon: "▭", attributes: mobilyaOznitelikleri(160, 40, 45) },
      { id: "mutfak_tezgahi", label: "Mutfak Tezgahı", icon: "▬", attributes: mobilyaOznitelikleri(240, 60, 90) },
      { id: "sehpa", label: "Sehpa", icon: "▢", attributes: mobilyaOznitelikleri(100, 55, 40) },
    ],
  },
  {
    id: "yapisal",
    label: "Yapısal",
    placement: "zemin",
    subtypes: [
      { id: "merdiven", label: "Merdiven", icon: "🪜", attributes: mobilyaOznitelikleri(120, 300, 270) },
      { id: "asansor", label: "Asansör", icon: "▣", attributes: mobilyaOznitelikleri(150, 150, 270) },
    ],
  },
  {
    id: "sihhi_tesisat",
    label: "Sıhhi Tesisat",
    // Lavabo/klozet/küvet duvara gömülü aksesuar değil, hacimli birer nesnedir;
    // bu yüzden mobilya gibi zemine yerleştirilir ve gerçek boyutlarıyla çizilir.
    placement: "zemin",
    subtypes: [
      { id: "lavabo", label: "Lavabo", icon: "◌", attributes: mobilyaOznitelikleri(60, 45, 85) },
      { id: "klozet", label: "Klozet", icon: "◍", attributes: mobilyaOznitelikleri(40, 65, 75) },
      { id: "dus_kabini", label: "Duş Kabini", icon: "▧", attributes: mobilyaOznitelikleri(90, 90, 200) },
      { id: "kuvet", label: "Küvet", icon: "▭", attributes: mobilyaOznitelikleri(170, 75, 55) },
      { id: "camasir_makinesi", label: "Çamaşır Makinesi", icon: "▣", attributes: mobilyaOznitelikleri(60, 60, 85) },
    ],
  },
  {
    id: "prizler",
    label: "Prizler",
    placement: "duvar",
    subtypes: [
      { id: "standart_priz", label: "Standart Priz", icon: "○", attributes: [
        { key: "yukseklik_zeminden", label: "Zeminden Yükseklik", type: "number", unit: "cm", default: 30 },
      ] },
      { id: "topraklı_priz", label: "Topraklı Priz", icon: "◎", attributes: [
        { key: "yukseklik_zeminden", label: "Zeminden Yükseklik", type: "number", unit: "cm", default: 30 },
      ] },
    ],
  },
  {
    id: "anahtarlar",
    label: "Anahtarlar",
    placement: "duvar",
    subtypes: [
      { id: "tekli_anahtar", label: "Tekli Anahtar", icon: "▪", attributes: [
        { key: "yukseklik_zeminden", label: "Zeminden Yükseklik", type: "number", unit: "cm", default: 105 },
      ] },
      { id: "komitatör", label: "Komitatör", icon: "▪▪", attributes: [
        { key: "yukseklik_zeminden", label: "Zeminden Yükseklik", type: "number", unit: "cm", default: 105 },
      ] },
    ],
  },
  {
    id: "aydinlatma",
    label: "Aydınlatma",
    // Tavan/duvar armatürleri bir duvara değil, oda içinde herhangi bir noktaya
    // (tavana bakan) serbestçe yerleştirilir; gerçek montaj yüksekliği
    // "yukseklik_zeminden" özniteliğinden gelir (bkz. View3D mobilya render'ı).
    placement: "zemin",
    subtypes: [
      { id: "tavan_armaturu", label: "Tavan Armatürü", icon: "☼", attributes: [
        { key: "genislik", label: "Genişlik", type: "number", unit: "cm", default: 15 },
        { key: "derinlik", label: "Derinlik", type: "number", unit: "cm", default: 15 },
        { key: "watt", label: "Güç", type: "number", unit: "W", default: 12 },
        { key: "yukseklik_zeminden", label: "Zeminden Yükseklik (tavana yakın)", type: "number", unit: "cm", default: 260 },
      ] },
      { id: "duvar_apliği", label: "Duvar Apliği", icon: "☾", attributes: [
        { key: "genislik", label: "Genişlik", type: "number", unit: "cm", default: 15 },
        { key: "derinlik", label: "Derinlik", type: "number", unit: "cm", default: 10 },
        { key: "watt", label: "Güç", type: "number", unit: "W", default: 8 },
        { key: "yukseklik_zeminden", label: "Zeminden Yükseklik", type: "number", unit: "cm", default: 180 },
      ] },
    ],
  },
];
