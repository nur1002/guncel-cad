import { useRef, useState } from "react";
import { useStore } from "../../engine/core/store";
import * as M from "../../engine/core/mutations";
import { handleImportFile } from "../../engine/io/importDispatch";
import CanvasEditor from "../../canvas/CanvasEditor";

export default function Stage1Screen() {
  const setWorkflowStage = useStore((s) => s.setWorkflowStage);
  const setTool = useStore((s) => s.setTool);
  const currentVariant = useStore((s) => s.currentVariant());
  const updateVariant = useStore((s) => s.updateVariant);
  const parsel = useStore((s) => s.parsel);
  const pushToast = useStore((s) => s.pushToast);
  const pages = useStore((s) => s.pages);
  const createPage = useStore((s) => s.createPage);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const reorderPagesAndRestack = useStore((s) => s.reorderPagesAndRestack);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showFloorOrder, setShowFloorOrder] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importedLabel, setImportedLabel] = useState<string | null>(null);

  // Görsel/kozmetik alanlar — gerçek bir projeksiyon/koordinat dönüşümüne bağlı
  // DEĞİLDİR (§ onaylanan ürün kararı). Yalnızca prototibin arayüzünü yansıtır.
  const [coordSystem, setCoordSystem] = useState("ITRF96 / TM");
  const [epsg, setEpsg] = useState("5253");
  const [unit, setUnit] = useState("metre");
  const [scaleText, setScaleText] = useState("1:200");

  const trace = currentVariant.vectorTrace;
  const bg = currentVariant.backgroundImage;

  const moveFloor = (index: number, dir: -1 | 1) => {
    const ids = pages.map((p) => p.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderPagesAndRestack(ids);
  };

  return (
    <div className="stage-body" style={{ flex: 1 }}>
      <div className="panel" style={{ width: 280 }}>
        <div className="section-title">Proje Verisi</div>
        <div
          className="upload-box"
          onClick={() => fileInputRef.current?.click()}
          style={{ opacity: importBusy ? 0.6 : 1, pointerEvents: importBusy ? "none" : "auto" }}
        >
          📐 {importBusy ? "Yükleniyor…" : "Kroki Yükle"}
          <br />
          <span style={{ fontSize: 10.5, opacity: 0.7 }}>.dwg .dxf .pdf .jpg</span>
        </div>
        {importedLabel && (
          <div className="filerow">
            <span className="dot" />
            {importedLabel}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.geojson,.dxf,.dwg"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setImportBusy(true);
            try {
              const ok = await handleImportFile(file);
              if (ok) setImportedLabel(`${file.name} algılandı`);
            } catch (err) {
              window.alert(`Hata: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              setImportBusy(false);
            }
          }}
        />

        <button
          className="pbtn"
          onClick={() => {
            const name = window.prompt("Yeni Sayfa Adı:", `Kat ${pages.length + 1}`);
            if (name && name.trim()) {
              const lastKot = pages.length > 0 ? pages[pages.length - 1].kotElevationCm + pages[pages.length - 1].heightCm : 0;
              const createdId = createPage(name.trim(), "konut", lastKot, 280);
              setActivePageId(createdId);
            }
          }}
        >
          <span className="ic">▦</span>Kat Planı Ekle
        </button>
        <button className="pbtn" onClick={() => setShowFloorOrder((v) => !v)}>
          <span className="ic">≡</span>Kat Sırası
        </button>
        {showFloorOrder && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {pages.map((p, i) => (
              <div key={p.id} className="filerow" style={{ justifyContent: "space-between" }}>
                <span>{p.name}</span>
                <span style={{ display: "flex", gap: 4 }}>
                  <button className="ghost-btn" style={{ width: "auto", margin: 0, padding: "2px 8px" }} onClick={() => moveFloor(i, -1)}>↑</button>
                  <button className="ghost-btn" style={{ width: "auto", margin: 0, padding: "2px 8px" }} onClick={() => moveFloor(i, 1)}>↓</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="section-title">Koordinat ve Ölçek</div>
        <div className="field">
          <label>Koordinat Sistemi</label>
          <select value={coordSystem} onChange={(e) => setCoordSystem(e.target.value)}>
            <option>ITRF96 / TM</option>
            <option>WGS84</option>
          </select>
        </div>
        <div className="field">
          <label>EPSG</label>
          <input value={epsg} onChange={(e) => setEpsg(e.target.value)} />
        </div>
        <div className="field">
          <label>Birim</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option>metre</option>
            <option>cm</option>
          </select>
        </div>
        <div className="field">
          <label>Ölçek</label>
          <input value={scaleText} onChange={(e) => setScaleText(e.target.value)} />
        </div>
        <div className="field">
          <label>Parsel Alanı (m²)</label>
          <input value={parsel.areaM2.toFixed(1)} disabled />
        </div>

        <div className="section-title">Hizalama</div>
        <button
          className="pbtn"
          disabled={!trace}
          onClick={() => {
            if (!trace) return;
            updateVariant((v) => M.fitVectorTraceToParcel(v, parsel.widthCm, parsel.lengthCm));
            const after = useStore.getState().currentVariant().vectorTrace;
            if (after && M.traceOverflowsParcel(after, parsel.widthCm, parsel.lengthCm)) {
              pushToast("Kroki parsele yerleştirildi (ölçek/açı nedeniyle sınırlara çok yakın).", "uyari");
            } else {
              pushToast("Kroki parsele yerleştirildi.", "basari");
            }
          }}
        >
          <span className="ic">⌖</span>Parsel ile Hizala
        </button>
        <button className="pbtn" onClick={() => setTool("point")}>
          <span className="ic">•</span>Referans Noktası Belirle
        </button>
        <button
          className="pbtn"
          disabled={!trace}
          onClick={() => {
            if (!trace) return;
            updateVariant((v) => M.updateVectorTrace(v, { locked: false }));
            setTool("select");
            pushToast("Kroki gövdesinden sürükleyip taşıyabilir, üstteki koldan döndürebilirsiniz.", "bilgi");
          }}
        >
          <span className="ic">✥</span>Taşı / Döndür
        </button>
        {trace && (
          <>
            <div className="field">
              <label>Ölçeklendir (scale)</label>
              <input
                type="number"
                step="0.01"
                value={trace.scale}
                disabled={trace.locked}
                onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { scale: Number(e.target.value) || trace.scale }))}
              />
            </div>
            <div className="field">
              <label>Kuzey Yönü / Açı (°)</label>
              <input
                type="number"
                value={Math.round(trace.rotationDeg)}
                disabled={trace.locked}
                onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { rotationDeg: Number(e.target.value) || 0 }))}
              />
            </div>
          </>
        )}
      </div>

      <div className="canvas-wrap">
        <CanvasEditor showPageTabs={false} showRulers={false} />
        {!trace && !bg && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ textAlign: "center", color: "var(--text-faint)" }}>
              <div style={{ fontSize: 44, opacity: 0.35 }}>⬚</div>
              <div style={{ fontSize: 12.5, marginTop: 6 }}>Yüklenen kroki burada önizlenecek</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>Katman görünürlüğü ve parsel hizalaması bu ekranda yapılır</div>
            </div>
          </div>
        )}
      </div>

      <div className="panel right" style={{ width: 240 }}>
        <div className="section-title">Katmanlar</div>
        {!trace && !bg ? (
          <div className="empty-state">Dosya yüklendiğinde katmanlar burada listelenecek</div>
        ) : (
          <>
            {trace && (
              <div className="prop-card">
                <div className="prop-title">Kroki (DWG/DXF)</div>
                <div className="prop-row">
                  <span className="k">Görünür</span>
                  <input
                    type="checkbox"
                    checked={trace.visible}
                    onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { visible: e.target.checked }))}
                  />
                </div>
                <div className="prop-row">
                  <span className="k">Saydamlık</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={trace.opacity}
                    onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { opacity: Number(e.target.value) }))}
                  />
                </div>
                <div className="prop-row">
                  <span className="k">Durum</span>
                  <span className="v">{trace.locked ? "Kilitli" : "Düzenlenebilir"}</span>
                </div>
              </div>
            )}
            {bg && (
              <div className="prop-card">
                <div className="prop-title">Arka Plan Görseli</div>
                <div className="prop-row">
                  <span className="k">Saydamlık</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={bg.opacity}
                    onChange={(e) => updateVariant((v) => M.updateBackgroundImage(v, { opacity: Number(e.target.value) }))}
                  />
                </div>
              </div>
            )}
          </>
        )}
        <button className="primary-btn" onClick={() => setWorkflowStage(2)}>
          Hazırla ve Çizime Geç →
        </button>
      </div>
    </div>
  );
}
