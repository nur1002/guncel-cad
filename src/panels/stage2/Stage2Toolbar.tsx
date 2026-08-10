import { useStore } from "../../engine/core/store";
import { ExportModal, NewProjectModal, OpenProjectModal, ProjectInfoModal } from "../../modals/Modals";

export default function Stage2Toolbar() {
  const activeModal = useStore((s) => s.activeModal);
  const setActiveModal = useStore((s) => s.setActiveModal);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const saveProjectToLocalStorage = useStore((s) => s.saveProjectToLocalStorage);
  const pushToast = useStore((s) => s.pushToast);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const toggleSnapEnabled = useStore((s) => s.toggleSnapEnabled);
  const gridVisible = useStore((s) => s.gridVisible);
  const toggleGridVisible = useStore((s) => s.toggleGridVisible);
  const gridStepCm = useStore((s) => s.gridStepCm);
  const setGridStepCm = useStore((s) => s.setGridStepCm);
  const orthoEnabled = useStore((s) => s.orthoEnabled);
  const toggleOrtho = useStore((s) => s.toggleOrtho);

  const handleSave = () => {
    saveProjectToLocalStorage();
    pushToast("Proje kaydedildi (Yerel Depolama).", "basari");
  };

  return (
    <>
      <div className="toolbar">
        <div className="proj-name">📁 Plaza Projesi</div>
        <div className="tb-sep" />
        <button className="tb-btn" title="Yeni Proje" onClick={() => setActiveModal("new")}>📄 Yeni</button>
        <button className="tb-btn" title="Proje Aç" onClick={() => setActiveModal("open")}>📂 Aç</button>
        <button className="tb-btn" title="Yardım & Bilgi" onClick={() => setActiveModal("info")}>❓ Yardım</button>
        <div className="tb-sep" />
        <button className="tb-btn" title="Geri Al (Ctrl+Z)" onClick={undo}>↶ Geri Al</button>
        <button className="tb-btn" title="İleri Al (Ctrl+Y)" onClick={redo}>↷ İleri Al</button>
        <div className="tb-sep" />
        <button className="tb-btn" title="Kaydet (Ctrl+S)" onClick={handleSave}>💾 Kaydet</button>
        <button className="tb-btn" title="Dışa Aktar" onClick={() => setActiveModal("export")}>⤓ Dışa Aktar</button>
        <div className="tb-sep" />
        <button className={`tb-btn ${snapEnabled ? "on" : ""}`} title="Snap (S)" onClick={toggleSnapEnabled}>🧲 Snap</button>
        <button className={`tb-btn ${orthoEnabled ? "on" : ""}`} title="Ortho (O)" onClick={toggleOrtho}>⊹ Ortho</button>
        <button className={`tb-btn ${gridVisible ? "on" : ""}`} title="Grid (G)" onClick={toggleGridVisible}>▦ Grid</button>
        <input
          className="tb-num"
          type="number"
          value={gridStepCm}
          onChange={(e) => setGridStepCm(Number(e.target.value) || gridStepCm)}
          title="Grid Adımı (cm)"
        />
        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>cm</span>
        <div className="tb-sep" />
        <button
          className="tb-btn"
          disabled
          style={{ opacity: 0.4, cursor: "not-allowed" }}
          title="3B görünüm bu aşamada pasif"
        >
          🧊 3D Oluştur (Yakında)
        </button>
      </div>

      {activeModal === "info" && <ProjectInfoModal onClose={() => setActiveModal(null)} />}
      {activeModal === "new" && <NewProjectModal onClose={() => setActiveModal(null)} />}
      {activeModal === "open" && <OpenProjectModal onClose={() => setActiveModal(null)} />}
      {activeModal === "export" && <ExportModal onClose={() => setActiveModal(null)} />}
    </>
  );
}
