import { useRef, useState } from "react";
import { useStore } from "../engine/store";
import { handleImportFile } from "../engine/importDispatch";
import { exportProjectAsCityGml } from "../engine/cityGmlExport";
import { exportVariantAsPdf } from "../engine/pdfExport";

const RIBBON_TABS = [
  { id: "cizim", label: "Çizim" },
  { id: "duzenle", label: "Düzenle" },
  { id: "gorunum", label: "Görünüm" },
  { id: "katmanlar", label: "Katmanlar" },
  { id: "araclar", label: "Araçlar" },
];

export default function Toolbar() {
  const [activeTab, setActiveTab] = useState("cizim");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setImporting] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);

  const gridStepCm = useStore((s) => s.gridStepCm);
  const setGridStepCm = useStore((s) => s.setGridStepCm);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const toggleSnapEnabled = useStore((s) => s.toggleSnapEnabled);
  const gridVisible = useStore((s) => s.gridVisible);
  const toggleGridVisible = useStore((s) => s.toggleGridVisible);
  const runTopologyCheckAction = useStore((s) => s.runTopologyCheckAction);
  const runMissingDoorCheckAction = useStore((s) => s.runMissingDoorCheckAction);
  const simulateAutoDetection = useStore((s) => s.simulateAutoDetection);
  const setNextWallThickness = useStore((s) => s.setNextWallThickness);
  const setTool = useStore((s) => s.setTool);
  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const toggleLeftRail = useStore((s) => s.toggleLeftRail);
  const pushToast = useStore((s) => s.pushToast);

  const [lineStyle, setLineStyle] = useState("surekli");
  const [lineThickness, setLineThickness] = useState("0.30");
  const [currentColor, setCurrentColor] = useState("#000000");
  const [colorLabel, setColorLabel] = useState("Siyah");
  const [orthoEnabled, setOrthoEnabled] = useState(true);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "araclar") {
      toggleLeftRail();
      pushToast(leftRailOpen ? "Araçlar paneli kapatıldı." : "Araçlar paneli açıldı.", "bilgi");
    } else if (tabId === "katmanlar") {
      setTool("layers");
      pushToast("Katmanlar modu aktif.", "bilgi");
    } else if (tabId === "gorunum") {
      toggleGridVisible();
    } else if (tabId === "cizim") {
      setTool("wall");
    } else if (tabId === "duzenle") {
      setTool("select");
    }
  };

  return (
    <div className="ribbon-bar">
      {/* Left Ribbon Menu Tabs */}
      <div className="ribbon-tabs">
        {RIBBON_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`ribbon-tab-btn ${activeTab === tab.id ? "ribbon-tab-btn--active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right Quick Controls Bar */}
      <div className="ribbon-controls">
        {/* Line Style Dropdown */}
        <div className="control-field">
          <select className="ribbon-select" value={lineStyle} onChange={(e) => setLineStyle(e.target.value)}>
            <option value="surekli">—— Sürekli</option>
            <option value="kesikli">--- Kesikli</option>
            <option value="noktali">···· Noktalı</option>
          </select>
        </div>

        {/* Line Thickness Dropdown */}
        <div className="control-field">
          <select
            className="ribbon-select"
            value={lineThickness}
            onChange={(e) => {
              setLineThickness(e.target.value);
              const cmVal = Math.round(Number(e.target.value) * 100);
              if (cmVal > 0) setNextWallThickness(cmVal);
            }}
          >
            <option value="0.15">0.15 mm</option>
            <option value="0.30">0.30 mm</option>
            <option value="0.50">0.50 mm</option>
            <option value="0.70">0.70 mm</option>
          </select>
        </div>

        {/* Color Box Swatch */}
        <div className="color-swatch-box" style={{ background: currentColor }} title="Çizim Rengi">
          <input
            type="color"
            value={currentColor}
            onChange={(e) => setCurrentColor(e.target.value)}
            className="color-input-hidden"
          />
        </div>

        {/* Color Text Dropdown */}
        <div className="control-field">
          <select
            className="ribbon-select"
            value={colorLabel}
            onChange={(e) => {
              setColorLabel(e.target.value);
              const colorMap: Record<string, string> = {
                Sarı: "#EAB308",
                Siyah: "#000000",
                Mavi: "#2563EB",
                Kırmızı: "#EF4444",
                Yeşil: "#22C55E",
              };
              if (colorMap[e.target.value]) setCurrentColor(colorMap[e.target.value]);
            }}
          >
            <option value="Siyah">Siyah</option>
            <option value="Sarı">Sarı</option>
            <option value="Mavi">Mavi</option>
            <option value="Kırmızı">Kırmızı</option>
            <option value="Yeşil">Yeşil</option>
          </select>
        </div>

        {/* Toggle Switch 1: Snap (Yakalama) */}
        <div className="toggle-switch-group">
          <label className="switch-label">
            <input type="checkbox" checked={snapEnabled} onChange={toggleSnapEnabled} />
            <span className="slider round"></span>
          </label>
          <span className="switch-text">Snap</span>
        </div>

        {/* Toggle Switch 2: Ortho (Orto Kilit) */}
        <div className="toggle-switch-group">
          <label className="switch-label">
            <input type="checkbox" checked={orthoEnabled} onChange={() => setOrthoEnabled(!orthoEnabled)} />
            <span className="slider round"></span>
          </label>
          <span className="switch-text">Orto</span>
        </div>

        {/* Toggle Switch 3: Grid (Izgara Görünümü) */}
        <div className="toggle-switch-group">
          <label className="switch-label">
            <input type="checkbox" checked={gridVisible} onChange={toggleGridVisible} />
            <span className="slider round"></span>
          </label>
          <span className="switch-text">Izgara</span>
        </div>

        {/* Grid Snap Distance Dropdown */}
        <div className="control-field">
          <select
            className="ribbon-select"
            value={gridStepCm}
            onChange={(e) => setGridStepCm(Number(e.target.value))}
          >
            <option value={5}>5 cm</option>
            <option value={10}>10 cm</option>
            <option value={20}>20 cm</option>
            <option value={50}>50 cm</option>
            <option value={100}>100 cm</option>
          </select>
        </div>

        {/* More Actions Menu Button `...` */}
        <div className="qa-menu-wrapper">
          <button className="ribbon-more-btn" title="Diğer İşlemler" onClick={() => setQaOpen(!qaOpen)}>
            •••
          </button>

          {qaOpen && (
            <>
              <div className="context-menu-backdrop" onPointerDown={() => setQaOpen(false)} />
              <div className="qa-menu">
                <div className="context-menu-title">İçe / Dışa Aktar</div>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setQaOpen(false);
                  }}
                >
                  📁 Kroki/Plan İçe Aktar
                </button>
                <button className="context-menu-item" onClick={() => exportVariantAsPdf(useStore.getState().currentVariant(), useStore.getState().roomTypes, useStore.getState().currentFloor().name)}>
                  📄 PDF Dışa Aktar
                </button>
                <button className="context-menu-item" onClick={() => exportProjectAsCityGml(useStore.getState().floors)}>
                  🏙️ CityGML Dışa Aktar
                </button>

                <div className="context-menu-title">Doğrulama</div>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    runTopologyCheckAction();
                    setQaOpen(false);
                  }}
                >
                  Topoloji Kontrolü
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    runMissingDoorCheckAction();
                    setQaOpen(false);
                  }}
                >
                  Eksik Kapı Kontrolü
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    simulateAutoDetection();
                    setQaOpen(false);
                  }}
                >
                  Oto-Algılama Simülasyonu
                </button>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.geojson,.json,.dxf,.dwg"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setImporting(true);
            try {
              await handleImportFile(file);
            } catch (err) {
              window.alert(`İçe aktarma başarısız: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              setImporting(false);
            }
          }}
        />
      </div>
    </div>
  );
}
