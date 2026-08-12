import { useStore, type Tool } from "../../engine/core/store";

const COMMAND_HINTS: Partial<Record<Tool, string>> = {
  wall: "Bir nokta tıklayın, zinciri Esc ile bitirin.",
  room: "Oda köşelerini sırayla tıklayın, başlangıca yaklaşıp kapatın.",
  roomRect: "Bir köşeden sürükleyerek dikdörtgen oda çizin.",
  polygon: "Poligon köşelerini sırayla tıklayın.",
  point: "Referans noktası için tuvale tıklayın.",
  measure: "Ölçmek için iki nokta tıklayın.",
  text: "Not eklemek için tuvale tıklayın.",
  place: "Bileşeni yerleştirmek için tıklayın.",
  select: "Seçim yapmak için nesneye tıklayın.",
  offset: "Ötelenecek duvara tıklayın, mesafeyi girin.",
  trim: "Kısaltılacak duvara, sonra sınır duvarına tıklayın.",
  extend: "Uzatılacak duvara, sonra sınır duvarına tıklayın.",
};

export default function BottomBar() {
  const cursorWorld = useStore((s) => s.cursorWorld);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const orthoEnabled = useStore((s) => s.orthoEnabled);
  const gridVisible = useStore((s) => s.gridVisible);
  const gridStepCm = useStore((s) => s.gridStepCm);
  const selection = useStore((s) => s.selection);
  const multiSelection = useStore((s) => s.multiSelection);
  const activePageId = useStore((s) => s.activePageId);
  const pages = useStore((s) => s.pages);
  const activeTool = useStore((s) => s.activeTool);

  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const drawing = currentPage ? currentPage.drawing : null;

  const cursorX = cursorWorld ? cursorWorld.x.toFixed(2) : "1250.00";
  const cursorY = cursorWorld ? cursorWorld.y.toFixed(2) : "840.00";
  const selectedCount = multiSelection.length > 0 ? multiSelection.length : selection ? 1 : 0;
  const objectCount = drawing
    ? Object.keys(drawing.corners).length + Object.keys(drawing.walls).length + Object.keys(drawing.components).length
    : 0;
  const commandHint = COMMAND_HINTS[activeTool] ?? "";

  return (
    <footer className="status-footer" style={{ height: "28px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", fontSize: "11px", color: "#475569", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
      {/* Left Side Status Strip (Matches Target Screenshot) */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span>X: <strong>{cursorX} cm</strong></span>
        <span>Y: <strong>{cursorY} cm</strong></span>
        <span>Z: <strong>0.00 cm</strong></span>
        <span style={{ color: "#cbd5e1" }}>|</span>
        <span>Ölçek: <strong>1/100</strong></span>
        <span>Birim: <strong>cm</strong></span>
        <span style={{ color: "#cbd5e1" }}>|</span>
        <span>Snap: <strong>{snapEnabled ? "Açık" : "Kapalı"}</strong></span>
        <span>Orto: <strong>{orthoEnabled ? "Açık" : "Kapalı"}</strong></span>
        <span>Grid: <strong>{gridVisible ? `${gridStepCm} cm` : "Kapalı"}</strong></span>
        <span style={{ color: "#cbd5e1" }}>|</span>
        <span>Seçili: <strong>{selectedCount}</strong></span>
        <span>Nesne Sayısı: <strong>{objectCount}</strong></span>
      </div>
      {commandHint && (
        <div className="pro-command">
          Komut: <b>{commandHint}</b>
        </div>
      )}
    </footer>
  );
}
