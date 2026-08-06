import { useState } from "react";
import { useStore } from "../engine/store";
import {
  ExportModal,
  NewProjectModal,
  OpenProjectModal,
  ProjectInfoModal,
} from "./Modals";

export default function TopNav() {
  const planMode = useStore((s) => s.planMode);
  const setPlanMode = useStore((s) => s.setPlanMode);
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setTool = useStore((s) => s.setTool);
  const saveProjectToLocalStorage = useStore((s) => s.saveProjectToLocalStorage);
  const openCatalogFor = useStore((s) => s.openCatalogFor);
  const pushToast = useStore((s) => s.pushToast);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const toggleSnapEnabled = useStore((s) => s.toggleSnapEnabled);
  const gridVisible = useStore((s) => s.gridVisible);
  const toggleGridVisible = useStore((s) => s.toggleGridVisible);
  const gridStepCm = useStore((s) => s.gridStepCm);
  const setGridStepCm = useStore((s) => s.setGridStepCm);

  const [activeTab, setActiveTab] = useState<"Çizim" | "Düzenle" | "Görünüm" | "Araçlar" | "Ayarlar">("Çizim");
  const [activeModal, setActiveModal] = useState<"info" | "new" | "open" | "export" | null>(null);
  const [ortoEnabled, setOrtoEnabled] = useState(false);

  const handleSave = () => {
    saveProjectToLocalStorage();
    pushToast("Proje kaydedildi (Yerel Depolama).", "basari");
  };

  return (
    <>
      <header className="top-nav-container" style={{ display: "flex", flexDirection: "column", width: "100%", zIndex: 100 }}>
        {/* 1. MAIN GLOBAL BLACK TOP NAV (Matches Target Screenshot) */}
        <div className="top-nav-bar" style={{ background: "#16181e", height: "50px", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#ffffff" }}>
          {/* Left Side: bilCAD Logo & Proje Adı Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="brand-logo">
              <span className="brand-text" style={{ fontSize: "20px", fontWeight: "900", color: "#facc15", letterSpacing: "0.5px" }}>bilCAD</span>
            </div>

            <div className="project-dropdown" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", padding: "5px 12px", borderRadius: "6px", fontSize: "13px" }}>
              <span>Proje Adı: <strong>Plaza Projesi</strong></span>
              <span style={{ fontSize: "10px", marginLeft: "4px" }}>▼</span>
            </div>
          </div>

          {/* Center Quick Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button className="top-action-btn" title="Yeni Proje" onClick={() => setActiveModal("new")} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>📄</span> Yeni
            </button>
            <button className="top-action-btn" title="Proje Aç" onClick={() => setActiveModal("open")} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>📂</span> Aç
            </button>
            <button className="top-action-btn" title="Kaydet" onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>💾</span> Kaydet
            </button>
            <button className="top-action-btn" title="Farklı Kaydet" onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>💾</span> Farklı Kaydet
            </button>
            <button className="top-action-btn" title="Dışa Aktar" onClick={() => setActiveModal("export")} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>📤</span> Dışa Aktar
            </button>
            <button className="top-action-btn" title="Geri Al (Ctrl+Z)" onClick={undo} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>↶</span> Geri Al
            </button>
            <button className="top-action-btn" title="İleri Al (Ctrl+Y)" onClick={redo} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>↷</span> İleri Al
            </button>
            <button className="top-action-btn" title="Ölçü" onClick={() => setTool("measure")} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>📏</span> Ölçü
            </button>
            <button className="top-action-btn" title="Blok Ekle" onClick={() => openCatalogFor("mobilya")} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>🧱</span> Blok Ekle
            </button>
            <button className="top-action-btn" title="Yardım & Bilgi" onClick={() => setActiveModal("info")} style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "12px" }}>
              <span>❓</span> Yardım
            </button>
          </div>

          {/* Right Controls: 2B / 3B Mode Switcher, Kat Selector, Gear, Bell, Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* 2B / 3B Mode Switcher Pill */}
            <div style={{ display: "flex", background: "#0f172a", borderRadius: "6px", padding: "2px" }}>
              <button
                style={{ padding: "4px 14px", border: "none", borderRadius: "4px", background: planMode !== "3d" ? "#2563eb" : "transparent", color: "#ffffff", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
                onClick={() => setPlanMode("2d")}
              >
                2B
              </button>
              <button
                style={{ padding: "4px 14px", border: "none", borderRadius: "4px", background: planMode === "3d" ? "#2563eb" : "transparent", color: "#ffffff", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
                onClick={() => setPlanMode("3d")}
              >
                3B
              </button>
            </div>

            {/* Kat Selector Dropdown */}
            <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "3px 8px" }}>
              <select
                value={activePageId}
                onChange={(e) => setActivePageId(e.target.value)}
                style={{ background: "transparent", border: "none", color: "#ffffff", fontSize: "12px", fontWeight: "600", outline: "none", cursor: "pointer" }}
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id} style={{ background: "#16181e", color: "#ffffff" }}>
                    Kat: {p.name}
                  </option>
                ))}
              </select>
            </div>

            <button style={{ background: "none", border: "none", color: "#e2e8f0", fontSize: "16px", cursor: "pointer" }} title="Ayarlar">⚙️</button>
            <div style={{ position: "relative", cursor: "pointer" }} title="Bildirimler">
              <span style={{ fontSize: "16px" }}>🔔</span>
              <span style={{ position: "absolute", top: "-4px", right: "-6px", background: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "bold", borderRadius: "50%", padding: "1px 4px" }}>3</span>
            </div>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#7c3aed", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "11px" }} title="Profil: AK">
              AK
            </div>
          </div>
        </div>

        {/* 2. SECONDARY RIBBON BAR (Matches Target Screenshot) */}
        <div style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", height: "42px", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Left Ribbon Category Tabs */}
          <div style={{ display: "flex", gap: "16px", fontSize: "13px", fontWeight: "600" }}>
            {(["Çizim", "Düzenle", "Görünüm", "Araçlar", "Ayarlar"] as const).map((tab) => (
              <span
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  cursor: "pointer",
                  color: activeTab === tab ? "#2563eb" : "#475569",
                  borderBottom: activeTab === tab ? "2px solid #2563eb" : "2px solid transparent",
                  paddingBottom: "10px",
                  paddingTop: "8px",
                }}
              >
                {tab}
              </span>
            ))}
          </div>

          {/* Right Ribbon Controls (Line Style, Line Width, Color, Snap, Orto, Grid, Grid Step) */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
            {/* Line Style Dropdown */}
            <select style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "3px 8px", fontSize: "12px", background: "#ffffff" }}>
              <option>— Sürekli</option>
              <option>- - Kesikli</option>
              <option>· · Noktalı</option>
            </select>

            {/* Line Thickness */}
            <select style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "3px 8px", fontSize: "12px", background: "#ffffff" }}>
              <option>0.30 mm</option>
              <option>0.15 mm</option>
              <option>0.50 mm</option>
              <option>0.70 mm</option>
            </select>

            {/* Color Swatch */}
            <div style={{ width: "20px", height: "20px", background: "#000000", borderRadius: "4px", border: "1px solid #cbd5e1", cursor: "pointer" }} title="Çizgi Rengi" />

            {/* Snap Toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "600", color: "#334155" }}>
              <span>Snap</span>
              <input type="checkbox" checked={snapEnabled} onChange={toggleSnapEnabled} style={{ accentColor: "#2563eb" }} />
            </label>

            {/* Orto Toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "600", color: "#334155" }}>
              <span>Orto</span>
              <input type="checkbox" checked={ortoEnabled} onChange={() => setOrtoEnabled(!ortoEnabled)} style={{ accentColor: "#2563eb" }} />
            </label>

            {/* Grid Toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "600", color: "#334155" }}>
              <span>Grid</span>
              <input type="checkbox" checked={gridVisible} onChange={toggleGridVisible} style={{ accentColor: "#2563eb" }} />
            </label>

            {/* Grid Step Dropdown */}
            <select
              value={gridStepCm}
              onChange={(e) => setGridStepCm(Number(e.target.value))}
              style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "3px 8px", fontSize: "12px", background: "#ffffff" }}
            >
              <option value={50}>50 cm</option>
              <option value={100}>100 cm</option>
              <option value={200}>200 cm</option>
            </select>

            <button style={{ border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: "4px", padding: "2px 8px", fontSize: "12px", cursor: "pointer" }}>...</button>
          </div>
        </div>
      </header>

      {/* Render Active Modal */}
      {activeModal === "info" && <ProjectInfoModal onClose={() => setActiveModal(null)} />}
      {activeModal === "new" && <NewProjectModal onClose={() => setActiveModal(null)} />}
      {activeModal === "open" && <OpenProjectModal onClose={() => setActiveModal(null)} />}
      {activeModal === "export" && <ExportModal onClose={() => setActiveModal(null)} />}
    </>
  );
}
