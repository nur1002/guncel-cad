import { useState } from "react";
import { useStore } from "../../engine/core/store";
import { dist } from "../../engine/drawing/geometry";
import { roomAreaM2 } from "../../engine/drawing/render2d";

export default function RightPanel() {
  const selection = useStore((s) => s.selection);
  const activePageId = useStore((s) => s.activePageId);
  const pages = useStore((s) => s.pages);
  const setPageOpacity = useStore((s) => s.setPageOpacity);
  const setTool = useStore((s) => s.setTool);
  const showDimensions = useStore((s) => s.showDimensionChains);
  const toggleDimensionChains = useStore((s) => s.toggleDimensionChains);
  const pushToast = useStore((s) => s.pushToast);

  // Global layer visibility states
  const layerVisibility = useStore((s) => s.layerVisibility);
  const toggleLayer = useStore((s) => s.toggleLayer);

  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const drawing = currentPage ? currentPage.drawing : null;

  const [opacityVal, setOpacityVal] = useState(30);

  // Accordion open/close states
  const [openSections, setOpenSections] = useState({
    ozellikler: true,
    gorunum: true,
    kat: true,
    hizli: true
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  let selType = "Yok";
  let selLayer = "-";
  let selColor = "-";
  let selMaterial = "-";
  let selLength = "-";
  let selThickness = "-";

  if (selection && drawing) {
    if (selection.type === "wall" && drawing.walls[selection.id]) {
      const w = drawing.walls[selection.id];
      const a = drawing.corners[w.a];
      const b = drawing.corners[w.b];
      selType = "Duvar";
      selLayer = w.type === "dis" || w.thickness >= 20 ? "1 - Dış Duvar" : "2 - İç Duvar";
      selMaterial = w.malzeme || "Tuğla";
      selThickness = `${w.thickness.toFixed(2)} cm`;
      selColor = "Varsayılan";
      if (a && b) {
        selLength = `${dist(a, b).toFixed(2)} cm`;
      }
    } else if (selection.type === "room" && drawing.rooms[selection.id]) {
      const r = drawing.rooms[selection.id];
      selType = "Oda";
      selLayer = "6 - Alan Etiketleri";
      selMaterial = "-";
      selThickness = "-";
      const area = r.manuelAlanM2 ?? roomAreaM2(r, drawing.corners);
      selLength = `${area.toFixed(2)} m²`;
    }
  }

  return (
    <aside
      className="right-panel-container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "12px",
        background: "#f8fafc",
        width: "100%",
        height: "100%",
        overflowY: "auto",
        boxSizing: "border-box",
        borderLeft: "1px solid #e2e8f0"
      }}
    >
      {/* 1. SEÇİLİ NESNE ÖZELLİKLERİ CARD */}
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div
          onClick={() => toggleSection("ozellikler")}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
        >
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            ÖZELLİKLER
          </span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>{openSections.ozellikler ? "▲" : "▼"}</span>
        </div>

        {openSections.ozellikler && (
          <div style={{ marginTop: "10px" }}>
            <div style={{ fontSize: "9px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.03em" }}>
              SEÇİM BİLGİSİ
            </div>
            <table className="inspector-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Tür</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{selType}</td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Uzunluk/Alan</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{selLength}</td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Kalınlık</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{selThickness}</td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Katman</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{selLayer}</td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Malzeme</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{selMaterial}</td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Renk</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{selColor}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. GÖRÜNÜM AYARLARI CARD */}
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div
          onClick={() => toggleSection("gorunum")}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
        >
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            GÖRÜNÜM AYARLARI
          </span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>{openSections.gorunum ? "▲" : "▼"}</span>
        </div>

        {openSections.gorunum && (
          <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "11.5px", color: "#334155" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px", color: "#64748b" }}>
                <span>Şeffaflık (Diğer Katlar)</span>
                <strong>%{opacityVal}</strong>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={opacityVal}
                className="custom-slider"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setOpacityVal(v);
                  setPageOpacity(activePageId, v / 100);
                }}
                style={{ width: "100%" }}
              />
            </div>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Referans Çizgileri</span>
              <input type="checkbox" checked={layerVisibility["referans"] !== false} onChange={() => toggleLayer("referans")} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Eksenler</span>
              <input type="checkbox" checked={layerVisibility["eksenler"] !== false} onChange={() => toggleLayer("eksenler")} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Cetvel (Koordinat Çizgileri)</span>
              <input type="checkbox" checked={layerVisibility["ruler"] === true} onChange={() => toggleLayer("ruler")} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Parsel Sınırı</span>
              <input type="checkbox" checked={layerVisibility["parsel"] !== false} onChange={() => toggleLayer("parsel")} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Ölçüler</span>
              <input type="checkbox" checked={showDimensions} onChange={toggleDimensionChains} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Kılavuz Çizgileri</span>
              <input type="checkbox" checked={layerVisibility["kilavuz"] !== false} onChange={() => toggleLayer("kilavuz")} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Oda Etiketleri</span>
              <input type="checkbox" checked={layerVisibility["etiketler"] !== false} onChange={() => toggleLayer("etiketler")} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "4px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#475569" }}>Kapılar & Pencereler</span>
              <input type="checkbox" checked={layerVisibility["kapi"] !== false && layerVisibility["pencere"] !== false} onChange={() => { toggleLayer("kapi"); toggleLayer("pencere"); }} style={{ accentColor: "var(--primary-blue)" }} />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <span style={{ color: "#475569" }}>Mobilyalar</span>
              <input type="checkbox" checked={layerVisibility["mobilya"] !== false} onChange={() => toggleLayer("mobilya")} style={{ accentColor: "var(--primary-blue)" }} />
            </label>
          </div>
        )}
      </div>

      {/* 3. KAT BİLGİLERİ CARD */}
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div
          onClick={() => toggleSection("kat")}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
        >
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            KAT BİLGİLERİ
          </span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>{openSections.kat ? "▲" : "▼"}</span>
        </div>

        {openSections.kat && (
          <div style={{ marginTop: "10px" }}>
            <table className="inspector-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Kat Adı</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{currentPage.name}</td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Kat Yüksekliği</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{currentPage.heightCm} cm</td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Kot</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>
                    {currentPage.kotElevationCm >= 0 ? "±" : ""}{(currentPage.kotElevationCm / 100).toFixed(2)} m
                  </td>
                </tr>
                <tr>
                  <td className="inspector-key" style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>Görünürlük</td>
                  <td className="inspector-value" style={{ padding: "4px 0", fontSize: "11px", color: "#334155", fontWeight: "600", textAlign: "right" }}>{currentPage.visible ? "Görünür" : "Gizli"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. HIZLI ARAÇLAR CARD */}
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div
          onClick={() => toggleSection("hizli")}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
        >
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            HIZLI ARAÇLAR
          </span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>{openSections.hizli ? "▲" : "▼"}</span>
        </div>

        {openSections.hizli && (
          <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <button
              onClick={() => setTool("measure")}
              style={{ padding: "6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", color: "#334155", cursor: "pointer", fontWeight: "500" }}
            >
              📏 Mesafe Ölç
            </button>
            <button
              onClick={() => pushToast("Alan hesabı yakında eklenecek.", "bilgi")}
              style={{ padding: "6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", color: "#334155", cursor: "pointer", fontWeight: "500" }}
            >
              📐 Alan Hesapla
            </button>
            <button
              onClick={() => pushToast("Not Ekleme yakında eklenecek.", "bilgi")}
              style={{ padding: "6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", color: "#334155", cursor: "pointer", fontWeight: "500" }}
            >
              📝 Not Ekle
            </button>
            <button
              onClick={() => pushToast("Resim Ekleme yakında eklenecek.", "bilgi")}
              style={{ padding: "6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", color: "#334155", cursor: "pointer", fontWeight: "500" }}
            >
              🖼 Resim Ekle
            </button>
            <button
              onClick={() => pushToast("PDF Ekleme yakında eklenecek.", "bilgi")}
              style={{ padding: "6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", color: "#334155", cursor: "pointer", fontWeight: "500" }}
            >
              📄 PDF Ekle
            </button>
            <button
              onClick={() => pushToast("Lejant yakında eklenecek.", "bilgi")}
              style={{ padding: "6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", color: "#334155", cursor: "pointer", fontWeight: "500" }}
            >
              🗺️ Lejant
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
