import React, { Suspense, lazy, useState, useEffect, useRef, Component } from "react";
import type { ReactNode } from "react";
import { useStore } from "./engine/core/store";
import TopNav from "./panels/top/TopNav";
import LeftToolRail from "./panels/left/LeftToolRail";
import LeftNavRail from "./panels/left/LeftNavRail";
import PageTabsBar from "./panels/top/PageTabsBar";
import CanvasEditor from "./canvas/CanvasEditor";
import RightPanel from "./panels/right/RightPanel";
import BottomBar from "./panels/bottom/BottomBar";
import ToolDock from "./panels/bottom/ToolDock";
import Toasts from "./ui/Toasts";
import KrokiWizardScreen from "./panels/stage1/KrokiWizardScreen";
import AlanYapiGisScreen from "./panels/stage4/AlanYapiGisScreen";

const View3D = lazy(() => import("./view3d/View3D"));

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("bilCAD Uncaught Error:", error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem("bilcad_project");
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc", fontFamily: "system-ui, sans-serif", color: "#1e293b", padding: "20px", textAlign: "center" }}>
          <div style={{ background: "#ffffff", padding: "30px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", maxWidth: "500px", width: "100%" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🏢</div>
            <h2 style={{ fontSize: "20px", margin: "0 0 10px 0", color: "#2563eb" }}>bilCAD Uygulaması</h2>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>
              Uygulama yüklenirken bir durum oluştu. Aşağıdaki butona basarak uygulamayı temizleyip yeniden başlatabilirsiniz.
            </p>
            <div style={{ background: "#f1f5f9", padding: "10px", borderRadius: "6px", fontSize: "12px", fontFamily: "monospace", color: "#ef4444", marginBottom: "20px", textAlign: "left", overflowX: "auto" }}>
              {this.state.error?.toString() || "Bilinmeyen Hata"}
            </div>
            <button
              onClick={this.handleReset}
              style={{ background: "#2563eb", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "6px", fontSize: "14px", fontWeight: "600", cursor: "pointer", width: "100%" }}
            >
              🔄 Uygulamayı Yeniden Başlat
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const planMode = useStore((s) => s.planMode);
  const workflowStage = useStore((s) => s.workflowStage);

  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const copySelectionToClipboard = useStore((s) => s.copySelectionToClipboard);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const selectAllInVariant = useStore((s) => s.selectAllInVariant);
  const saveProjectToLocalStorage = useStore((s) => s.saveProjectToLocalStorage);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const setSelection = useStore((s) => s.setSelection);
  const setMultiSelection = useStore((s) => s.setMultiSelection);
  const setTool = useStore((s) => s.setTool);
  const openCatalogFor = useStore((s) => s.openCatalogFor);
  const fitToScreen = useStore((s) => s.fitToScreen);
  const toggleGridVisible = useStore((s) => s.toggleGridVisible);
  const toggleSnapEnabled = useStore((s) => s.toggleSnapEnabled);
  const toggleOrtho = useStore((s) => s.toggleOrtho);
  const toggleContinuousDrawing = useStore((s) => s.toggleContinuousDrawing);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const toggleLeftRail = useStore((s) => s.toggleLeftRail);

  // Resizable Side Panels State
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(260);
  const [isDockOpen, setIsDockOpen] = useState(true);
  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);
  const COLLAPSED_STRIP_WIDTH = 28;

  // Global Keyboard Shortcuts — Profesyonel CAD Kısayolları
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl kombinasyonları
      if (isCtrl && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (isCtrl && key === "y") {
        e.preventDefault();
        redo();
      } else if (isCtrl && key === "c") {
        e.preventDefault();
        copySelectionToClipboard();
      } else if (isCtrl && key === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if (isCtrl && key === "a") {
        e.preventDefault();
        selectAllInVariant();
      } else if (isCtrl && key === "s") {
        e.preventDefault();
        saveProjectToLocalStorage();
      }
      // Silme
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      }
      // Escape — iptal
      else if (e.key === "Escape") {
        e.preventDefault();
        setSelection(null);
        setMultiSelection([]);
        setTool("select");
      }
      // ── CAD Araç Kısayolları (Ctrl olmadan) ──
      else if (!isCtrl) {
        switch (key) {
          case "w": e.preventDefault(); setTool("wall"); break;
          case "q": e.preventDefault(); setTool("select"); break;
          case "e": e.preventDefault(); deleteSelection(); break;
          case "r": e.preventDefault(); setTool("room"); break;
          case "p": e.preventDefault(); setTool("polygon"); break;
          case "t": e.preventDefault(); setTool("text"); break;
          case "m": e.preventDefault(); setTool("select"); break;
          case "1": e.preventDefault(); openCatalogFor("kapi"); break;
          case "2": e.preventDefault(); openCatalogFor("pencere"); break;
          case "f": e.preventDefault(); fitToScreen(); break;
          case "g": e.preventDefault(); toggleGridVisible(); break;
          case "s":
            e.preventDefault();
            // Aktif bir duvar/oda çizim zinciri varsa 'S' onu durdurur; yoksa
            // her zamanki gibi Snap aç/kapat kısayolu olarak çalışır (§ tek,
            // sıralamadan bağımsız karar noktası — bkz. store.ts açıklaması).
            if (useStore.getState().isChainDrawingActive) {
              useStore.getState().requestStopDraw();
            } else {
              toggleSnapEnabled();
            }
            break;
          case "o": e.preventDefault(); toggleOrtho(); break;
          case " ": e.preventDefault(); toggleContinuousDrawing(); break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, copySelectionToClipboard, pasteClipboard, selectAllInVariant, saveProjectToLocalStorage, deleteSelection, setSelection, setMultiSelection, setTool, openCatalogFor, fitToScreen, toggleGridVisible, toggleSnapEnabled, toggleOrtho, toggleContinuousDrawing]);

  // Handle panel resizing
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
    <div className="app" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <TopNav />
      {workflowStage === "kroki" ? (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <LeftNavRail />
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <KrokiWizardScreen />
          </div>
        </div>
      ) : workflowStage === "alan_yapi" ? (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <LeftNavRail />
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <AlanYapiGisScreen />
          </div>
        </div>
      ) : (
        <>
          <div className="workspace" style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
            {/* Far-Left Dikey Navigation Rail */}
            <LeftNavRail />

            {/* Left Panel: SAYFALAR & REFERANS KOORDİNAT */}
            {leftRailOpen ? (
              <div style={{ width: `${leftWidth}px`, display: "flex", flexShrink: 0, position: "relative" }}>
                <LeftToolRail />
                <div
                  className="panel-resizer-handle"
                  style={{ right: 0 }}
                  onMouseDown={() => (isDraggingLeft.current = true)}
                  title="Paneli Genişletmek İçin Sürükleyin"
                />
                <button
                  className="panel-collapse-btn panel-collapse-btn--left"
                  onClick={toggleLeftRail}
                  style={{
                    position: "absolute",
                    right: "-12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    cursor: "pointer",
                    zIndex: 100,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    color: "#64748b"
                  }}
                  title="Sol Paneli Kapat"
                >
                  ‹
                </button>
              </div>
            ) : (
              <button
                onClick={toggleLeftRail}
                style={{
                  width: `${COLLAPSED_STRIP_WIDTH}px`,
                  background: "#f8fafc",
                  border: "none",
                  borderRight: "1px solid #e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  color: "#64748b",
                  fontWeight: "bold",
                  height: "100%",
                  boxSizing: "border-box"
                }}
                title="Sol Paneli Aç"
              >
                ›
              </button>
            )}

            {/* Center Canvas Area with Rulers & Page Tabs */}
            <div className="canvas-area" style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <PageTabsBar />
              {workflowStage === "3d" || planMode === "3d" ? (
                <Suspense fallback={<div className="placeholder-section">3B görünüm portalı yükleniyor…</div>}>
                  <View3D />
                </Suspense>
              ) : (
                <CanvasEditor />
              )}
            </div>

            {/* Middle-Right Panel: ÖZELLİKLER & GÖRÜNÜM AYARLARI & HIZLI ARAÇLAR — açılır/kapanır + genişliği ayarlanabilir */}
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
                  onClick={toggleRightPanel}
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
                onClick={toggleRightPanel}
                title="Özellikler Panelini Aç"
              >
                ‹
              </button>
            )}
          </div>
          {isDockOpen && <ToolDock />}
          <BottomBar />

          {/* Big Fixed "+" Toggle Button (Sol Alt Köşede Sabit) */}
          <button
            onClick={() => setIsDockOpen(!isDockOpen)}
            style={{
              position: "fixed",
              bottom: "40px",
              left: "80px",
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "var(--primary-blue)",
              color: "#ffffff",
              border: "none",
              fontSize: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37,99,235,0.35)",
              zIndex: 1000,
              transition: "transform 0.2s ease",
              transform: isDockOpen ? "rotate(45deg)" : "rotate(0deg)",
            }}
            title={isDockOpen ? "Çizim Araçları Paletini Kapat" : "Çizim Araçları Paletini Aç"}
          >
            +
          </button>
        </>
      )}
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
