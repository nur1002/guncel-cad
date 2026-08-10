import { useEffect, useRef, useState } from "react";
import LeftToolRail from "../left/LeftToolRail";
import CanvasEditor from "../../canvas/CanvasEditor";
import RightPanel from "../right/RightPanel";
import Stage2Toolbar from "./Stage2Toolbar";
import FloorTabsBar from "./FloorTabsBar";
import Stage2StatusBar from "./Stage2StatusBar";
import FabMenu from "./FabMenu";

export default function Stage2Screen() {
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(260);
  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const COLLAPSED_STRIP_WIDTH = 28;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft.current) {
        const newW = Math.max(220, Math.min(500, e.clientX - 52));
        setLeftWidth(newW);
      }
      if (isDraggingRight.current) {
        const newW = Math.max(200, Math.min(500, window.innerWidth - e.clientX));
        setRightWidth(newW);
      }
    };
    const handleMouseUp = () => {
      isDraggingLeft.current = false;
      isDraggingRight.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="stage2-root">
      <Stage2Toolbar />
      <FloorTabsBar />
      <div className="stage-body" style={{ flex: 1 }}>
        <div style={{ width: `${leftWidth + 52}px`, display: "flex", flexShrink: 0, position: "relative" }}>
          <LeftToolRail />
          <div
            className="panel-resizer-handle"
            style={{ right: 0 }}
            onMouseDown={() => (isDraggingLeft.current = true)}
            title="Paneli Genişletmek İçin Sürükleyin"
          />
        </div>

        <div className="canvas-wrap">
          <CanvasEditor showPageTabs={false} />
          <FabMenu />
        </div>

        {rightPanelOpen ? (
          <div style={{ width: `${rightWidth}px`, display: "flex", flexShrink: 0, position: "relative" }}>
            <div
              className="panel-resizer-handle"
              style={{ left: 0 }}
              onMouseDown={() => (isDraggingRight.current = true)}
              title="Paneli Genişletmek İçin Sürükleyin"
            />
            <button
              className="panel-collapse-btn panel-collapse-btn--right"
              onClick={() => setRightPanelOpen(false)}
              title="Paneli Daralt"
            >
              ›
            </button>
            <RightPanel />
          </div>
        ) : (
          <button
            className="panel-collapsed-strip"
            style={{ width: `${COLLAPSED_STRIP_WIDTH}px` }}
            onClick={() => setRightPanelOpen(true)}
            title="Özellikler Panelini Aç"
          >
            ‹
          </button>
        )}
      </div>
      <Stage2StatusBar />
    </div>
  );
}
