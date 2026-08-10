import { useState } from "react";
import { useStore } from "../../engine/core/store";
import { exportProjectAsCityGml } from "../../engine/io/cityGmlExport";
import { exportVariantAsPdf } from "../../engine/io/pdfExport";

type FabAction = () => void;
interface FabItem {
  label: string;
  action?: FabAction;
  soon?: boolean; // motor/UI karşılığı henüz yok — dürüstçe "yakında" etiketlenir
}

export default function FabMenu() {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("Çizim");

  const setTool = useStore((s) => s.setTool);
  const setPendingPlacement = useStore((s) => s.setPendingPlacement);
  const openCatalogFor = useStore((s) => s.openCatalogFor);
  const setActiveRailTab = useStore((s) => s.setActiveRailTab);
  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const setLeftRailOpen = useStore((s) => s.setLeftRailOpen);
  const setWorkflowStage = useStore((s) => s.setWorkflowStage);
  const setActiveModal = useStore((s) => s.setActiveModal);
  const fitToScreen = useStore((s) => s.fitToScreen);
  const toggleGridVisible = useStore((s) => s.toggleGridVisible);
  const runTopologyCheckAction = useStore((s) => s.runTopologyCheckAction);
  const runMissingDoorCheckAction = useStore((s) => s.runMissingDoorCheckAction);
  const simulateAutoDetection = useStore((s) => s.simulateAutoDetection);

  const openRailTab = (tab: Parameters<typeof setActiveRailTab>[0]) => {
    setActiveRailTab(tab);
    if (!leftRailOpen) setLeftRailOpen(true);
  };

  const FAB_CATS: Record<string, FabItem[]> = {
    "Çizim": [
      { label: "Duvar", action: () => setTool("wall") },
      { label: "Oda (Serbest Çokgen)", action: () => setTool("room") },
      { label: "Not Ekle", action: () => setTool("text") },
      { label: "Notlar Listesi", action: () => openRailTab("notlar") },
      { label: "Offset", soon: true },
      { label: "Trim / Extend", soon: true },
      { label: "Fillet / Chamfer", soon: true },
      { label: "Array (Dizi)", soon: true },
    ],
    "Ölçü": [
      { label: "Mesafe Ölç", action: () => setTool("measure") },
      { label: "Ölçü & Duvar Kalınlığı Paneli", action: () => openRailTab("olcu") },
      { label: "Açı Ölç", soon: true },
    ],
    "Mimari": [
      { label: "Bileşen Kataloğu (Kapı/Pencere/Mobilya)", action: () => openRailTab("bilesenler") },
      {
        label: "Kapı Yerleştir",
        action: () => {
          setPendingPlacement({ tip: "kapi", subtypeId: "tek_kanat_kapi", overrides: { genislik: 90, yukseklik: 210 } });
          setTool("place");
        },
      },
      {
        label: "Pencere Yerleştir",
        action: () => {
          setPendingPlacement({ tip: "pencere", subtypeId: "tek_kanat", overrides: { genislik: 120, yukseklik: 140 } });
          setTool("place");
        },
      },
      {
        label: "Merdiven Yerleştir",
        action: () => {
          openCatalogFor("yapisal");
          openRailTab("bilesenler");
        },
      },
      { label: "Kolon", soon: true },
      { label: "Kiriş", soon: true },
      { label: "Döşeme", soon: true },
    ],
    "Katman": [
      { label: "Katman Yöneticisi", soon: true },
      { label: "Görünürlük", soon: true },
    ],
    "Parsel": [
      { label: "Parsel Ayarları / Boyutları", action: () => openRailTab("ayarlar") },
      { label: "Kroki Parsele Yerleştirme", action: () => openRailTab("ayarlar") },
    ],
    "Analiz": [
      { label: "TAKS / KAKS", action: () => setWorkflowStage(3) },
      { label: "Oda Analizi / Alan Bilgileri", action: () => setWorkflowStage(3) },
      { label: "Kat Özeti (Raporlar)", action: () => openRailTab("raporlar") },
      { label: "Topoloji Kontrolü", action: () => runTopologyCheckAction() },
      { label: "Eksik Kapı Kontrolü", action: () => runMissingDoorCheckAction() },
      { label: "Oto-Algılama Simülasyonu", action: () => simulateAutoDetection() },
    ],
    "Görünüm": [
      { label: "Zoom Fit", action: () => fitToScreen() },
      { label: "Grid Aç/Kapat", action: () => toggleGridVisible() },
    ],
    "Dosya": [
      { label: "İçe Aktar", action: () => setActiveModal("open") },
      { label: "Dışa Aktar", action: () => setActiveModal("export") },
      {
        label: "PDF Dışa Aktar",
        action: () => {
          const s = useStore.getState();
          exportVariantAsPdf(s.currentVariant(), s.roomTypes, s.currentFloor().name);
        },
      },
      { label: "CityGML Dışa Aktar", action: () => exportProjectAsCityGml(useStore.getState().floors) },
    ],
    "Ayarlar": [
      { label: "Sayfalar (Katlar)", action: () => openRailTab("sayfalar") },
      { label: "Yardım / Bilgi", action: () => setActiveModal("info") },
    ],
  };

  const items = FAB_CATS[cat] ?? [];

  const runItem = (item: FabItem) => {
    if (item.soon || !item.action) {
      setOpen(false);
      return;
    }
    item.action();
    setOpen(false);
  };

  return (
    <>
      <button className={`fab ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)} title="Hızlı Araçlar">
        +
      </button>
      <div className={`fab-panel ${open ? "show" : ""}`}>
        <div className="fab-tabs">
          {Object.keys(FAB_CATS).map((c) => (
            <div key={c} className={`fab-tab ${c === cat ? "active" : ""}`} onClick={() => setCat(c)}>
              {c}
            </div>
          ))}
        </div>
        <div className="fab-list">
          {items.map((item) => (
            <div key={item.label} className="fab-item" onClick={() => runItem(item)}>
              {item.label}
              {item.soon && <span className="tag">yakında</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
