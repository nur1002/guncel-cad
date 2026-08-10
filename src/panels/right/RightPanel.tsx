import { useState } from "react";
import { useStore } from "../../engine/core/store";
import * as M from "../../engine/core/mutations";
import { dist } from "../../engine/drawing/geometry";
import { roomAreaM2 } from "../../engine/drawing/render2d";
import { wallMaterials, floorMaterials } from "../../data/materials";

export default function RightPanel() {
  const selection = useStore((s) => s.selection);
  const activePageId = useStore((s) => s.activePageId);
  const pages = useStore((s) => s.pages);
  const setTool = useStore((s) => s.setTool);
  const setPageOpacity = useStore((s) => s.setPageOpacity);
  const pushToast = useStore((s) => s.pushToast);
  const updateVariant = useStore((s) => s.updateVariant);
  const areaUpdateMode = useStore((s) => s.areaUpdateMode);
  const toggleAreaUpdateMode = useStore((s) => s.toggleAreaUpdateMode);

  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const drawing = currentPage ? currentPage.drawing : null;

  const [opacityVal, setOpacityVal] = useState(40);
  const [showRefLines, setShowRefLines] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showParselBorder, setShowParselBorder] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);

  // Selected Entity specs readout

  return (
    <aside className="right-panel-container" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "12px", background: "var(--bg)", width: "100%", overflowY: "auto" }}>
      {/* 1. ÖZELLİKLER CARD */}
      <div className="accordion-card" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--accent)", textTransform: "uppercase", marginBottom: "8px" }}>
          ÖZELLİKLER
        </div>
        
        {selection && drawing ? (
          <div>
            {selection.type === "wall" && drawing.walls[selection.id] && (() => {
              const wall = drawing.walls[selection.id];
              const a = drawing.corners[wall.a];
              const b = drawing.corners[wall.b];
              const len = a && b ? Math.round(dist(a, b)) : 0;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px", color: "var(--text)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Uzunluk</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        value={len}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0) updateVariant((vData) => M.changeWallLength(vData, wall.id, v));
                        }}
                        style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                      />
                      <span>cm</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Kalınlık</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        value={wall.thickness}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0) updateVariant((vData) => M.setWallThickness(vData, wall.id, v));
                        }}
                        style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                      />
                      <span>cm</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Yükseklik</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        value={wall.height ?? 280}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0) updateVariant((vData) => M.setWallHeight(vData, wall.id, v));
                        }}
                        style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                      />
                      <span>cm</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Malzeme</span>
                    <select
                      value={wall.malzeme || "siva"}
                      onChange={(e) => {
                        updateVariant((vData) => {
                          const wl = vData.walls[wall.id];
                          return { ...vData, walls: { ...vData.walls, [wall.id]: { ...wl, malzeme: e.target.value } } };
                        });
                      }}
                      style={{ width: "90px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--panel-2)", color: "var(--text)" }}
                    >
                      {wallMaterials.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })()}

            {selection.type === "room" && drawing.rooms[selection.id] && (() => {
              const room = drawing.rooms[selection.id];
              const area = room.manuelAlanM2 ?? roomAreaM2(room, drawing.corners);
              const roomTypes = useStore.getState().roomTypes;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px", color: "var(--text)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Oda Adı</span>
                    <input
                      type="text"
                      value={room.name}
                      onChange={(e) => {
                        updateVariant((vData) => {
                          const rm = vData.rooms[room.id];
                          return { ...vData, rooms: { ...vData.rooms, [room.id]: { ...rm, name: e.target.value } } };
                        });
                      }}
                      style={{ width: "100px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--panel-2)", color: "var(--text)" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Oda Türü</span>
                    <select
                      value={room.typeId}
                      onChange={(e) => {
                        updateVariant((vData) => {
                          const rm = vData.rooms[room.id];
                          return { ...vData, rooms: { ...vData.rooms, [room.id]: { ...rm, typeId: e.target.value } } };
                        });
                      }}
                      style={{ width: "100px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--panel-2)", color: "var(--text)" }}
                    >
                      {roomTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Yükseklik</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        value={room.height}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0) updateVariant((vData) => M.setRoomHeight(vData, room.id, v));
                        }}
                        style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                      />
                      <span>cm</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Zemin Malzemesi</span>
                    <select
                      value={room.zeminMalzemesi || "parke"}
                      onChange={(e) => {
                        updateVariant((vData) => {
                          const rm = vData.rooms[room.id];
                          return { ...vData, rooms: { ...vData.rooms, [room.id]: { ...rm, zeminMalzemesi: e.target.value } } };
                        });
                      }}
                      style={{ width: "100px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--panel-2)", color: "var(--text)" }}
                    >
                      {floorMaterials.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", borderTop: "1px solid var(--border-soft)", paddingTop: "4px" }}>
                    <span>Hesaplanan Alan</span>
                    <strong>{area.toFixed(2)} m²</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Manuel Alan</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        step="0.01"
                        value={room.manuelAlanM2 ?? ""}
                        placeholder={area.toFixed(2)}
                        onChange={(e) => {
                          const v = e.target.value.trim() === "" ? undefined : Number(e.target.value);
                          updateVariant((vData) => M.setRoomManualArea(vData, room.id, v));
                        }}
                        style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                      />
                      <span>m²</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selection.type === "component" && drawing.components[selection.id] && (() => {
              const comp = drawing.components[selection.id];
              const catalog = useStore.getState().catalog;
              const cat = catalog.find((c) => c.id === comp.tip);
              const sub = cat?.subtypes.find((s) => s.id === comp.altTip);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px", color: "var(--text)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Bileşen</span>
                    <strong>{sub?.label || comp.altTip}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Kategori</span>
                    <strong>{cat?.label || comp.tip}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Genişlik</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        value={comp.oznitelikler["genislik"] !== undefined ? String(comp.oznitelikler["genislik"]) : ""}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0) {
                            updateVariant((vData) => {
                              const c = vData.components[comp.id];
                              return { ...vData, components: { ...vData.components, [comp.id]: { ...c, oznitelikler: { ...c.oznitelikler, genislik: v } } } };
                            });
                          }
                        }}
                        style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                      />
                      <span>cm</span>
                    </div>
                  </div>
                  {comp.oznitelikler["derinlik"] !== undefined && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>Derinlik</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          value={comp.oznitelikler["derinlik"] !== undefined ? String(comp.oznitelikler["derinlik"]) : ""}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v > 0) {
                              updateVariant((vData) => {
                                const c = vData.components[comp.id];
                                return { ...vData, components: { ...vData.components, [comp.id]: { ...c, oznitelikler: { ...c.oznitelikler, derinlik: v } } } };
                              });
                            }
                          }}
                          style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                        />
                        <span>cm</span>
                      </div>
                    </div>
                  )}
                  {comp.oznitelikler["yukseklik"] !== undefined && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>Yükseklik</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          value={comp.oznitelikler["yukseklik"] !== undefined ? String(comp.oznitelikler["yukseklik"]) : ""}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v > 0) {
                              updateVariant((vData) => {
                                const c = vData.components[comp.id];
                                return { ...vData, components: { ...vData.components, [comp.id]: { ...c, oznitelikler: { ...c.oznitelikler, yukseklik: v } } } };
                              });
                            }
                          }}
                          style={{ width: "70px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", textAlign: "right", background: "var(--panel-2)", color: "var(--text)" }}
                        />
                        <span>cm</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div style={{ fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic", textAlign: "center" }}>
            Seçili Nesne Yok
          </div>
        )}
      </div>

      {/* 2. GÖRÜNÜM AYARLARI CARD */}
      <div className="accordion-card" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--accent)", textTransform: "uppercase", marginBottom: "10px" }}>
          GÖRÜNÜM AYARLARI
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px", color: "var(--text)" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
              <span>Şeffaflık (Diğer Sayfalar)</span>
              <strong>%{opacityVal}</strong>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={opacityVal}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOpacityVal(v);
                setPageOpacity(activePageId, v / 100);
              }}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
          </div>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Referans Çizgileri</span>
            <input type="checkbox" checked={showRefLines} onChange={() => setShowRefLines(!showRefLines)} />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Eksenler</span>
            <input type="checkbox" checked={showAxes} onChange={() => setShowAxes(!showAxes)} />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Parsel Sınırı</span>
            <input type="checkbox" checked={showParselBorder} onChange={() => setShowParselBorder(!showParselBorder)} />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span>Ölçüler</span>
            <input type="checkbox" checked={showDimensions} onChange={() => setShowDimensions(!showDimensions)} />
          </label>
        </div>
      </div>

      {/* 3. HIZLI ARAÇLAR CARD (6 Grid Buttons Match Target Screenshot) */}
      <div className="accordion-card" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--accent)", textTransform: "uppercase", marginBottom: "10px" }}>
          HIZLI ARAÇLAR
        </div>
        <div className="quick-tools-grid">
          <button
            className={`quick-tool-btn ${areaUpdateMode ? "quick-tool-btn--active" : ""}`}
            onClick={toggleAreaUpdateMode}
            title="Alan Güncelle"
            style={{
              border: areaUpdateMode ? "1px solid #d97706" : undefined,
              background: areaUpdateMode ? "#fef3c7" : undefined,
              color: areaUpdateMode ? "#b45309" : undefined,
              fontWeight: areaUpdateMode ? "700" : "500"
            }}
          >
            <span>⚡</span> Alan Güncelle
          </button>
          <button className="quick-tool-btn" onClick={() => setTool("measure")} title="Mesafe Ölç">
            <span>📏</span> Mesafe Ölç
          </button>
          <button className="quick-tool-btn" onClick={() => setTool("text")} title="Not Ekle">
            <span>💬</span> Not Ekle
          </button>
          <button className="quick-tool-btn" onClick={() => pushToast("Resim/Raster katmanı eklendi.", "bilgi")} title="Resim Ekle">
            <span>🖼</span> Resim Ekle
          </button>
          <button className="quick-tool-btn" onClick={() => pushToast("PDF içe aktarıldı.", "bilgi")} title="PDF Ekle">
            <span>📄</span> PDF Ekle
          </button>
          <button className="quick-tool-btn" onClick={() => pushToast("Lejant katmanı aktif.", "bilgi")} title="Lejant">
            <span>📋</span> Lejant
          </button>
        </div>
      </div>
    </aside>
  );
}
