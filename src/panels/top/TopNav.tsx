import { useState } from "react";
import { useStore } from "../../engine/core/store";
import {
  ExportModal,
  NewProjectModal,
  OpenProjectModal,
  ProjectInfoModal,
} from "../../modals/Modals";
import Stepper from "./Stepper";

export default function TopNav() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const saveProjectToLocalStorage = useStore((s) => s.saveProjectToLocalStorage);
  const pushToast = useStore((s) => s.pushToast);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const toggleSnapEnabled = useStore((s) => s.toggleSnapEnabled);
  const orthoEnabled = useStore((s) => s.orthoEnabled);
  const toggleOrtho = useStore((s) => s.toggleOrtho);
  const gridVisible = useStore((s) => s.gridVisible);
  const toggleGridVisible = useStore((s) => s.toggleGridVisible);
  const gridStepCm = useStore((s) => s.gridStepCm);
  const setGridStepCm = useStore((s) => s.setGridStepCm);
  const toggleLeftRail = useStore((s) => s.toggleLeftRail);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const openCatalogFor = useStore((s) => s.openCatalogFor);

  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);

  const [activeModal, setActiveModal] = useState<"info" | "new" | "open" | "export" | null>(null);

  const handleSave = () => {
    saveProjectToLocalStorage();
    pushToast("Proje kaydedildi (Yerel Depolama).", "basari");
  };

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", width: "100%", zIndex: 100 }}>
        {/* Marka + Proje Adı + Stepper (açık zemin) */}
        <div style={{ background: "#ffffff", borderBottom: "1px solid var(--border-light)", height: "48px", padding: "0 14px", display: "flex", alignItems: "center", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }} onClick={() => setActiveModal("info")}>
            <span style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>Plaza Projesi</span>
            <span style={{ fontSize: "10px", color: "#64748b" }}>▼</span>
          </div>

          <Stepper />

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px" }}>
            <button style={{ background: "none", border: "none", color: "#64748b", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center" }} title="Ayarlar">
              ⚙️
            </button>
            <button
              style={{ background: "none", border: "none", color: "#64748b", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center" }}
              title="Yardım"
              onClick={() => setActiveModal("info")}
            >
              ❓
            </button>
            <div style={{ position: "relative", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }} title="Bildirimler">
              <span style={{ fontSize: "16px" }}>🔔</span>
              <span style={{ position: "absolute", top: "-4px", right: "-6px", background: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "bold", borderRadius: "50%", padding: "1px 4px" }}>3</span>
            </div>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#22c55e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "11px" }} title="Profil">
              HN
            </div>
          </div>
        </div>

        {/* Tek satır araç çubuğu */}
        <div className="pro-toolbar">
          <button className="pro-toolbar-btn" title="Yeni Proje" onClick={() => setActiveModal("new")}>📄 Yeni</button>
          <button className="pro-toolbar-btn" title="Proje Aç" onClick={() => setActiveModal("open")}>📂 Aç</button>
          <button className="pro-toolbar-btn" title="Kaydet (Ctrl+S)" onClick={handleSave}>💾 Kaydet</button>
          <button className="pro-toolbar-btn" title="Farklı Kaydet" onClick={handleSave}>💾 Farklı Kaydet</button>
          <button className="pro-toolbar-btn" title="Dışa Aktar" onClick={() => setActiveModal("export")}>⤓ Dışa Aktar</button>
          <div className="pro-toolbar-sep" />
          <button className="pro-toolbar-btn" title="Geri Al (Ctrl+Z)" onClick={undo}>↶ Geri Al</button>
          <button className="pro-toolbar-btn" title="İleri Al (Ctrl+Y)" onClick={redo}>↷ İleri Al</button>
          <div className="pro-toolbar-sep" />
          <button className={`pro-toolbar-btn ${activeTool === "select" ? "pro-toolbar-btn--on" : ""}`} title="Seç (Q)" onClick={() => setTool("select")}>⬈ Seç</button>
          <button className={`pro-toolbar-btn ${orthoEnabled ? "pro-toolbar-btn--on" : ""}`} title="Ortho (O)" onClick={toggleOrtho}>∟ Ortho</button>
          <button className={`pro-toolbar-btn ${snapEnabled ? "pro-toolbar-btn--on" : ""}`} title="Snap (S)" onClick={toggleSnapEnabled}>🗲 Snap</button>
          <button className={`pro-toolbar-btn ${gridVisible ? "pro-toolbar-btn--on" : ""}`} title="Grid (G)" onClick={toggleGridVisible}>▦ Grid</button>
          <input
            className="pro-toolbar-num"
            type="number"
            value={gridStepCm}
            onChange={(e) => setGridStepCm(Number(e.target.value) || gridStepCm)}
            title="Grid Adımı (cm)"
          />
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>cm</span>
          <div className="pro-toolbar-sep" />
          <button className={`pro-toolbar-btn ${leftRailOpen ? "pro-toolbar-btn--on" : ""}`} title="Sol Paneli Aç/Kapat" onClick={toggleLeftRail}>🥞 Katmanlar</button>
          <button className={`pro-toolbar-btn ${rightPanelOpen ? "pro-toolbar-btn--on" : ""}`} title="Sağ Paneli Aç/Kapat" onClick={toggleRightPanel}>👁 Görünüm</button>
          <div className="pro-toolbar-sep" />
          <button className={`pro-toolbar-btn ${activeTool === "measure" ? "pro-toolbar-btn--on" : ""}`} title="Ölçü" onClick={() => setTool("measure")}>📏 Ölçü</button>
          <button className="pro-toolbar-btn" title="Blok Ekle" onClick={() => openCatalogFor("mobilya")}>🧱 Blok Ekle</button>
          <button className="pro-toolbar-btn" title="Yardım & Bilgi" onClick={() => setActiveModal("info")}>❓ Yardım</button>
        </div>
      </header>

      {activeModal === "info" && <ProjectInfoModal onClose={() => setActiveModal(null)} />}
      {activeModal === "new" && <NewProjectModal onClose={() => setActiveModal(null)} />}
      {activeModal === "open" && <OpenProjectModal onClose={() => setActiveModal(null)} />}
      {activeModal === "export" && <ExportModal onClose={() => setActiveModal(null)} />}
    </>
  );
}
