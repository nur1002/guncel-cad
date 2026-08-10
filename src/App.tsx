import React, { Suspense, lazy, useEffect, useRef, Component } from "react";
import type { ReactNode } from "react";
import { useStore } from "./engine/core/store";
import Toasts from "./ui/Toasts";
import StageStepper from "./panels/StageStepper";
import Stage1Screen from "./panels/stage1/Stage1Screen";
import Stage2Screen from "./panels/stage2/Stage2Screen";
import Stage3Screen from "./panels/stage3/Stage3Screen";

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
  const setPendingPlacement = useStore((s) => s.setPendingPlacement);
  const zoomAtScreenPoint = useStore((s) => s.zoomAtScreenPoint);

  const mouseScreenRef = useRef<{ x: number; y: number }>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    const trackMouse = (e: MouseEvent) => {
      mouseScreenRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", trackMouse);
    return () => window.removeEventListener("mousemove", trackMouse);
  }, []);

  const zoomInAtMouse = () => {
    const canvas = document.querySelector("canvas");
    let pt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      pt = {
        x: mouseScreenRef.current.x - rect.left,
        y: mouseScreenRef.current.y - rect.top,
      };
    }
    zoomAtScreenPoint(pt, 1.15);
  };

  const zoomOutAtMouse = () => {
    const canvas = document.querySelector("canvas");
    let pt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      pt = {
        x: mouseScreenRef.current.x - rect.left,
        y: mouseScreenRef.current.y - rect.top,
      };
    }
    zoomAtScreenPoint(pt, 1 / 1.15);
  };

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
      } else if (isCtrl && (key === "+" || key === "=")) {
        e.preventDefault();
        zoomInAtMouse();
      } else if (isCtrl && key === "-") {
        e.preventDefault();
        zoomOutAtMouse();
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
      // Sadece Stage 2 (2B Çizim) aktifken anlamlı — Stage 1'de de bir CanvasEditor
      // örneği (parsele hizalama önizlemesi) mevcut, 'w' gibi tuşlar orada yanlışlıkla
      // duvar aracını silahlandırmasın diye workflowStage'e bağlandı.
      else if (!isCtrl && useStore.getState().workflowStage === 2) {
        switch (key) {
          case "w": e.preventDefault(); setTool("wall"); break;
          case "q": e.preventDefault(); setTool("select"); break;
          case "e": e.preventDefault(); deleteSelection(); break;
          case "r": e.preventDefault(); setTool("room"); break;
          case "p": e.preventDefault(); setTool("polygon"); break;
          case "t": e.preventDefault(); setTool("text"); break;
          case "m": e.preventDefault(); setTool("select"); break;
          case "1":
            e.preventDefault();
            setPendingPlacement({ tip: "kapi", subtypeId: "tek_kanat_kapi", overrides: { genislik: 90, yukseklik: 210 } });
            setTool("place");
            break;
          case "2":
            e.preventDefault();
            setPendingPlacement({ tip: "pencere", subtypeId: "tek_kanat", overrides: { genislik: 120, yukseklik: 140 } });
            setTool("place");
            break;
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
  }, [undo, redo, copySelectionToClipboard, pasteClipboard, selectAllInVariant, saveProjectToLocalStorage, deleteSelection, setSelection, setMultiSelection, setTool, openCatalogFor, fitToScreen, toggleGridVisible, toggleSnapEnabled, toggleOrtho, toggleContinuousDrawing, setPendingPlacement, zoomAtScreenPoint]);

  return (
    <div className="app">
      <StageStepper />
      {workflowStage === 1 ? (
        <Stage1Screen />
      ) : workflowStage === 3 ? (
        <Stage3Screen />
      ) : planMode === "3d" ? (
        // Artık hiçbir UI bu dalı tetiklemiyor (2B/3B pill kaldırıldı) — View3D.tsx
        // ve veri akışı korunuyor, ileride gerçek bir 3B giriş noktası eklenmek
        // istendiğinde burası tek satırlık bir değişiklikle geri açılabilir.
        <Suspense fallback={<div className="placeholder-section">3B görünüm portalı yükleniyor…</div>}>
          <View3D />
        </Suspense>
      ) : (
        <Stage2Screen />
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
