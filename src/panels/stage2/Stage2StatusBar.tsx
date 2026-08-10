import { useStore } from "../../engine/core/store";

export default function Stage2StatusBar() {
  const cursorWorld = useStore((s) => s.cursorWorld);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const gridVisible = useStore((s) => s.gridVisible);
  const gridStepCm = useStore((s) => s.gridStepCm);
  const orthoEnabled = useStore((s) => s.orthoEnabled);
  const activeTool = useStore((s) => s.activeTool);
  const selection = useStore((s) => s.selection);
  const multiSelection = useStore((s) => s.multiSelection);
  const activePageId = useStore((s) => s.activePageId);
  const pages = useStore((s) => s.pages);

  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const drawing = currentPage ? currentPage.drawing : null;

  const cursorX = cursorWorld ? (cursorWorld.x / 100).toFixed(2) : "0.00";
  const cursorY = cursorWorld ? (cursorWorld.y / 100).toFixed(2) : "0.00";
  const selectedCount = multiSelection.length > 0 ? multiSelection.length : selection ? 1 : 0;
  const objectCount = drawing
    ? Object.keys(drawing.corners).length + Object.keys(drawing.walls).length + Object.keys(drawing.components).length
    : 0;

  const TOOL_LABELS: Record<string, string> = {
    select: "Seç", wall: "Duvar", room: "Oda", place: "Yerleştir", measure: "Ölçü", text: "Not", point: "Nokta",
  };

  return (
    <div className="statusbar">
      <span>X: {cursorX}  Y: {cursorY} m</span>
      <div className="sep" />
      <span>Araç: {TOOL_LABELS[activeTool] || activeTool}</span>
      <div className="sep" />
      <span className={`flag ${snapEnabled ? "on" : ""}`}>SNAP</span>
      <span className={`flag ${orthoEnabled ? "on" : ""}`}>ORTHO</span>
      <span className={`flag ${gridVisible ? "on" : ""}`}>GRID{gridVisible ? ` (${gridStepCm}cm)` : ""}</span>
      <div className="sep" />
      <span>Seçili: {selectedCount}</span>
      <span>{objectCount} nesne</span>
    </div>
  );
}
