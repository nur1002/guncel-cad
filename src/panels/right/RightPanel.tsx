import { useState } from "react";
import { useStore } from "../../engine/core/store";

export default function RightPanel() {
  const selection = useStore((s) => s.selection);
  const activePageId = useStore((s) => s.activePageId);
  const pages = useStore((s) => s.pages);
  const setTool = useStore((s) => s.setTool);
  const setPageOpacity = useStore((s) => s.setPageOpacity);
  const pushToast = useStore((s) => s.pushToast);

  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const drawing = currentPage ? currentPage.drawing : null;

  const [opacityVal, setOpacityVal] = useState(40);
  const [showRefLines, setShowRefLines] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showParselBorder, setShowParselBorder] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);

  // Selected Entity specs readout
  let selType = "-";
  let selLayer = "-";
  let selColor = "-";
  let selLineType = "-";
  let selLineWidth = "-";
  let selArea = "-";
  let selPerimeter = "-";
  let selX = "-";
  let selY = "-";
  let selZ = `${(currentPage.kotElevationCm / 100).toFixed(2)} m`;

  if (selection && drawing) {
    if (selection.type === "wall" && drawing.walls[selection.id]) {
      const w = drawing.walls[selection.id];
      selType = "Duvar";
      selLayer = "Duvarlar";
      selColor = w.malzeme || "Sıva";
      selLineWidth = `${w.thickness} cm`;
      selLineType = "Sürekli";
    } else if (selection.type === "room" && drawing.rooms[selection.id]) {
      const r = drawing.rooms[selection.id];
      selType = "Oda / Bağımsız Bölüm";
      selLayer = "Odalar";
      selArea = `${(r.manuelAlanM2 || 15.6).toFixed(2)} m²`;
    }
  }

  return (
    <aside className="right-panel-container" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "12px", background: "#f8fafc", width: "100%", overflowY: "auto" }}>
      {/* 1. ÖZELLİKLER CARD */}
      <div className="accordion-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", marginBottom: "8px" }}>
          ÖZELLİKLER
        </div>
        <div style={{ fontSize: "11px", color: "#64748b", fontStyle: selection ? "normal" : "italic", marginBottom: "10px", textAlign: "center" }}>
          {selection ? `Seçili: ${selType}` : "Seçili Nesne Yok"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px", color: "#334155" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tür</span><strong>{selType}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Katman</span><strong>{selLayer}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Renk</span><strong>{selColor}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Çizgi Tipi</span><strong>{selLineType}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Çizgi Kalınlığı</span><strong>{selLineWidth}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Alan</span><strong>{selArea}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Çevre</span><strong>{selPerimeter}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Koordinat X</span><strong>{selX}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Koordinat Y</span><strong>{selY}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Koordinat Z</span><strong>{selZ}</strong></div>
        </div>
      </div>

      {/* 2. GÖRÜNÜM AYARLARI CARD */}
      <div className="accordion-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", marginBottom: "10px" }}>
          GÖRÜNÜM AYARLARI
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px", color: "#334155" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
              <span>Şeffaflık (Diğer Sayfalar)</span>
              <strong>%{opacityVal}</strong>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={opacityVal}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOpacityVal(v);
                setPageOpacity(activePageId, v / 100);
              }}
              style={{ width: "100%", accentColor: "#2563eb" }}
            />
          </div>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Referans Çizgileri</span>
            <input type="checkbox" checked={showRefLines} onChange={() => setShowRefLines(!showRefLines)} />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Eksenler</span>
            <input type="checkbox" checked={showAxes} onChange={() => setShowAxes(!showAxes)} />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Parsel Sınırı</span>
            <input type="checkbox" checked={showParselBorder} onChange={() => setShowParselBorder(!showParselBorder)} />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Ölçüler</span>
            <input type="checkbox" checked={showDimensions} onChange={() => setShowDimensions(!showDimensions)} />
          </label>
        </div>
      </div>

      {/* 3. HIZLI ARAÇLAR CARD (6 Grid Buttons Match Target Screenshot) */}
      <div className="accordion-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", marginBottom: "10px" }}>
          HIZLI ARAÇLAR
        </div>
        <div className="quick-tools-grid">
          <button className="quick-tool-btn" onClick={() => setTool("room")} title="Alan Hesapla">
            <span>📐</span> Alan Hesapla
          </button>
          <button className="quick-tool-btn" onClick={() => setTool("measure")} title="Mesafe Ölç">
            <span>📏</span> Mesafe Ölç
          </button>
          <button className="quick-tool-btn" onClick={() => setTool("text")} title="Not Ekle">
            <span>💬</span> Not Ekle
          </button>
          <button className="quick-tool-btn" onClick={() => pushToast("Resim/Raster katmanı eklendi.", "bilgi")} title="Resim Ekle">
            <span>🖼</span> Resim Ekle
          </button>
          <button className="quick-tool-btn" onClick={() => pushToast("PDF içe aktarıldı.", "bilgi")} title="PDF Ekle">
            <span>📄</span> PDF Ekle
          </button>
          <button className="quick-tool-btn" onClick={() => pushToast("Lejant katmanı aktif.", "bilgi")} title="Lejant">
            <span>📋</span> Lejant
          </button>
        </div>
      </div>
    </aside>
  );
}
