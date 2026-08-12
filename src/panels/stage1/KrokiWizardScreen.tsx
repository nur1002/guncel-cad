import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useStore } from "../../engine/core/store";
import * as M from "../../engine/core/mutations";
import { handleImportFile } from "../../engine/io/importDispatch";

// 5 teknik adım (Dosya Yükle / Ölçek & Birim / Yön & Hizalama / Koordinatlandırma /
// Önizleme & Onay) 4 kullanıcı-odaklı adıma indirildi — "Yön & Hizalama" ve
// "Koordinatlandırma" tek adımda birleşti, EPSG/koordinat sistemi "Gelişmiş Ayarlar"
// accordion'una taşındı (§ Aşama 1 UX yeniden tasarımı, 2026-08-11).
const STEPS = [
  { n: 1, title: "Krokini Yükle", desc: "Dosyanı sisteme ekle" },
  { n: 2, title: "Ölçüyü Belirle", desc: "Ölçek ve birim" },
  { n: 3, title: "Parselinle Eşleştir", desc: "Konumunu belirle" },
  { n: 4, title: "Kontrol Et", desc: "Çizime hazırla" },
] as const;

const primaryBtn: CSSProperties = {
  background: "var(--primary-blue)",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtn: CSSProperties = {
  background: "#ffffff",
  color: "#334155",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const cardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 20,
};

function StepHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{title}</div>
      {desc && <div style={{ fontSize: 13.5, color: "#64748b" }}>{desc}</div>}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#64748b", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13.5,
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  color: "#0f172a",
  boxSizing: "border-box",
};

function EmptyStateHint({ text }: { text: string }) {
  return (
    <div style={{ ...cardStyle, textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 32 }}>{text}</div>
  );
}

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div style={{ marginTop: 16, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background: "#f8fafc",
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 600,
          color: "#475569",
        }}
      >
        <span>{title}</span>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}

/** Krokinin (VectorTrace) çizgilerinden küçük, statik bir önizleme SVG'si üretir. */
function TracePreview({ trace }: { trace: { segments: { a: { x: number; y: number }; b: { x: number; y: number } }[]; widthCm: number; heightCm: number } }) {
  if (trace.segments.length === 0 || trace.widthCm <= 0 || trace.heightCm <= 0) return null;
  const pad = 6;
  const size = 100;
  const scale = Math.min((size - pad * 2) / trace.widthCm, (size - pad * 2) / trace.heightCm);
  const ox = trace.widthCm / 2;
  const oy = trace.heightCm / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect x={0} y={0} width={size} height={size} fill="#f8fafc" />
      {trace.segments.slice(0, 400).map((seg, i) => (
        <line
          key={i}
          x1={size / 2 + (seg.a.x - ox) * scale}
          y1={size / 2 + (seg.a.y - oy) * scale}
          x2={size / 2 + (seg.b.x - ox) * scale}
          y2={size / 2 + (seg.b.y - oy) * scale}
          stroke="#2563eb"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

/** Parsel oranına göre küçük, statik bir dikdörtgen önizlemesi. */
function ParcelPreview({ widthCm, lengthCm }: { widthCm: number; lengthCm: number }) {
  const size = 100;
  const pad = 10;
  const scale = Math.min((size - pad * 2) / Math.max(widthCm, 1), (size - pad * 2) / Math.max(lengthCm, 1));
  const w = widthCm * scale;
  const h = lengthCm * scale;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect x={0} y={0} width={size} height={size} fill="#f8fafc" />
      <rect x={(size - w) / 2} y={(size - h) / 2} width={w} height={h} fill="rgba(22,163,74,0.08)" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="4 3" />
    </svg>
  );
}

export default function KrokiWizardScreen() {
  const [step, setStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showAdvancedCoord, setShowAdvancedCoord] = useState(false);
  const [editingParsel, setEditingParsel] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setWorkflowStage = useStore((s) => s.setWorkflowStage);
  const currentVariant = useStore((s) => s.currentVariant());
  const updateVariant = useStore((s) => s.updateVariant);
  const parsel = useStore((s) => s.parsel);
  const setParselInfo = useStore((s) => s.setParselInfo);
  const pushToast = useStore((s) => s.pushToast);

  const trace = currentVariant.vectorTrace;
  const bg = currentVariant.backgroundImage;

  // Görsel/kozmetik alanlar — gerçek bir projeksiyon dönüşümüne bağlı DEĞİL
  // (§ önceki turda onaylanan karar, EPSG alanları için aynı desen).
  const [coordSystem, setCoordSystem] = useState("ITRF96 / TM (EPSG:5253)");
  const [unit, setUnit] = useState("cm");
  const [scaleText, setScaleText] = useState("1:100");

  const unitLabel = unit === "cm" ? "Santimetre (cm)" : unit === "m" ? "Metre (m)" : "Milimetre (mm)";

  const handleFile = async (file: File) => {
    setImportBusy(true);
    try {
      const ok = await handleImportFile(file);
      if (ok) {
        setUploadedFile(file);
        pushToast(`"${file.name}" içe aktarıldı.`, "basari");
        setStep(2);
      }
    } catch (err) {
      window.alert(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportBusy(false);
    }
  };

  // Her adımın "tamamlandı" sayılması için gereken koşul — İleri butonu ve sol
  // adım listesindeki gezinme buna göre kilitlenir/açılır (§ "kullanıcı görmediği
  // şeyi doldurmak zorunda olmamalı" — engelleme mesajı yerine adım kilitleme).
  const hasImported = !!(trace || bg || uploadedFile);
  const matchComplete = !trace || trace.locked;
  const stepComplete: Record<number, boolean> = { 1: hasImported, 2: true, 3: matchComplete, 4: true };
  const isReachable = (n: number) => {
    for (let i = 1; i < n; i++) if (!stepComplete[i]) return false;
    return true;
  };

  const goNext = () => setStep((s) => (stepComplete[s] ? Math.min(4, s + 1) : s));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleAutoDetect = () => {
    if (!trace) {
      pushToast("Bu dosya türü için otomatik ölçek uygulanamıyor.", "bilgi");
      return;
    }
    updateVariant((v) => M.fitVectorTraceToParcel(v, parsel.widthCm, parsel.lengthCm));
    pushToast("Kroki parsele göre otomatik ölçeklendirildi.", "basari");
  };

  const finish = () => {
    if (trace) updateVariant((v) => M.updateVectorTrace(v, { locked: true }));
    setWorkflowStage("cizim2d");
  };

  return (
    <div style={{ flex: 1, display: "flex", background: "#f1f5f9", minHeight: 0 }}>
      {/* Sol: adım listesi */}
      <div style={{ width: 260, flexShrink: 0, background: "#ffffff", borderRight: "1px solid #e2e8f0", padding: "20px 16px", overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>
          Krokiyi Hazırla
        </div>
        {STEPS.map((s) => {
          const reachable = isReachable(s.n);
          const done = step > s.n && stepComplete[s.n];
          const active = step === s.n;
          return (
            <div
              key={s.n}
              onClick={() => reachable && setStep(s.n)}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "10px 8px",
                borderRadius: 8,
                cursor: reachable ? "pointer" : "not-allowed",
                background: active ? "var(--primary-blue-light)" : "transparent",
                opacity: reachable ? 1 : 0.5,
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  marginTop: 1,
                  background: active ? "var(--primary-blue)" : done ? "#22c55e" : "#e2e8f0",
                  color: active || done ? "#ffffff" : "#94a3b8",
                }}
              >
                {done ? "✓" : s.n}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--primary-blue)" : "#334155" }}>{s.title}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Orta: adım içeriği */}
      <div style={{ flex: 1, padding: "32px 40px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", flex: 1 }}>
          {step === 1 && (
            <div>
              <StepHeader title="Krokini Yükle" desc="Kroki, mimari plan veya çizim dosyanı yükle." />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                style={{
                  border: `2px dashed ${dragOver ? "var(--primary-blue)" : "#cbd5e1"}`,
                  borderRadius: 14,
                  padding: "56px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "var(--primary-blue-light)" : "#f8fafc",
                  opacity: importBusy ? 0.6 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: 42, marginBottom: 10 }}>📄</div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                  {importBusy ? "Yükleniyor…" : "Krokini buraya bırak"}
                </div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 18 }}>veya dosya seç</div>
                <button style={primaryBtn} onClick={(e) => e.stopPropagation()}>
                  Bilgisayardan Seç
                </button>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 16 }}>JPG · PNG · PDF · DXF · DWG · Maks. 50 MB</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.geojson,.dxf,.dwg"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleFile(file);
                }}
              />
              {hasImported && (
                <div style={{ ...cardStyle, marginTop: 16, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
                  <span style={{ color: "#22c55e", fontSize: 16 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{uploadedFile?.name ?? "Kroki"}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {uploadedFile
                        ? `${uploadedFile.name.split(".").pop()?.toUpperCase()} · ${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB`
                        : trace
                        ? `${trace.segments.length} çizgi segmenti`
                        : "Görsel arka plan"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <StepHeader title="Ölçüyü Belirle" desc="Krokideki ölçülerin gerçek ölçülerle eşleşmesi için ölçek ve birim bilgisini kontrol et." />
              {hasImported ? (
                <div style={cardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 16 }}>📐 ÖLÇEK VE BİRİM</div>
                  <FieldRow label="Ölçü birimi">
                    <select value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle}>
                      <option value="cm">Santimetre (cm)</option>
                      <option value="m">Metre (m)</option>
                      <option value="mm">Milimetre (mm)</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="Ölçek">
                    <input value={scaleText} onChange={(e) => setScaleText(e.target.value)} style={inputStyle} placeholder="1:100" />
                  </FieldRow>
                  <div style={{ fontSize: 12, color: "#64748b", background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
                    ℹ️ 1:100 ölçek, krokideki 1 cm'nin gerçekte 1 metre olduğu anlamına gelir.
                  </div>
                  {trace && (
                    <FieldRow label="Gerçek ölçek çarpanı (canvas'ta uygulanan)">
                      <input
                        type="number"
                        step="0.01"
                        value={trace.scale}
                        disabled={trace.locked}
                        onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { scale: Number(e.target.value) || trace.scale }))}
                        style={inputStyle}
                      />
                    </FieldRow>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button style={ghostBtn} onClick={handleAutoDetect}>⌖ Otomatik Algıla</button>
                  </div>
                </div>
              ) : (
                <EmptyStateHint text="Önce bir kroki yükleyin (Adım 1)." />
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <StepHeader
                title="Parselinle Eşleştir"
                desc="Krokini gerçek dünyadaki parselin üzerine yerleştireceğiz. Krokideki referans noktalarının parseldeki karşılığını eşleştir."
              />
              {trace ? (
                <>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1, ...cardStyle, padding: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", marginBottom: 8, letterSpacing: "0.04em" }}>KROKİ</div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <TracePreview trace={trace} />
                      </div>
                    </div>
                    <div style={{ flex: 1, ...cardStyle, padding: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", marginBottom: 8, letterSpacing: "0.04em" }}>PARSEL</div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <ParcelPreview widthCm={parsel.widthCm} lengthCm={parsel.lengthCm} />
                      </div>
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <FieldRow label="Açı / Kuzey Yönü (°)">
                      <input
                        type="number"
                        value={Math.round(trace.rotationDeg)}
                        disabled={trace.locked}
                        onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { rotationDeg: Number(e.target.value) || 0 }))}
                        style={inputStyle}
                      />
                    </FieldRow>
                    {trace.locked ? (
                      <button
                        style={ghostBtn}
                        onClick={() => {
                          updateVariant((v) => M.updateVectorTrace(v, { locked: false }));
                          pushToast("Kroki tekrar düzenlemeye açıldı.", "bilgi");
                        }}
                      >
                        🔓 Düzenlemeye Aç
                      </button>
                    ) : (
                      <button
                        style={primaryBtn}
                        onClick={() => {
                          updateVariant((v) => M.fitVectorTraceToParcel(v, parsel.widthCm, parsel.lengthCm));
                          const after = useStore.getState().currentVariant().vectorTrace;
                          if (after && M.traceOverflowsParcel(after, parsel.widthCm, parsel.lengthCm)) {
                            pushToast("Kroki parsele yerleştirildi (ölçek/açı nedeniyle sınırlara çok yakın).", "uyari");
                          } else {
                            pushToast("Kroki parsele yerleştirildi.", "basari");
                          }
                        }}
                      >
                        ⌖ Parsel ile Hizala
                      </button>
                    )}
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 12 }}>
                      İpucu: "2B Çizim" ekranına geçtiğinizde kroki üzerinde doğrudan sürükleyip döndürme koluyla da hizalayabilirsiniz.
                    </div>
                  </div>

                  <Accordion title="⚙ Gelişmiş Koordinat Ayarları" open={showAdvancedCoord} onToggle={() => setShowAdvancedCoord((v) => !v)}>
                    <FieldRow label="Koordinat sistemi">
                      <select value={coordSystem} onChange={(e) => setCoordSystem(e.target.value)} style={inputStyle}>
                        <option>ITRF96 / TM (EPSG:5253)</option>
                        <option>WGS84 (EPSG:4326)</option>
                        <option>Web Mercator (EPSG:3857)</option>
                      </select>
                    </FieldRow>
                    <div style={{ fontSize: 11.5, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px" }}>
                      ⚠ Bu ayarlar teknik kullanıcılar içindir. Bu sürümde gerçek bir jeodezik projeksiyon dönüşümü uygulanmaz — parsel hizalaması düz cm tabanlı çalışır.
                    </div>
                  </Accordion>
                </>
              ) : bg ? (
                <EmptyStateHint text="Görsel/PDF dosyalar için otomatik hizalama yok — '2B Çizim' ekranında sürükleyerek konumlandırabilirsiniz." />
              ) : (
                <EmptyStateHint text="Önce bir kroki yükleyin (Adım 1)." />
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <StepHeader title="Hazırsın!" desc="" />
              <div style={cardStyle}>
                <SummaryRow label="KROKİ" value={uploadedFile?.name ?? (bg ? "Görsel dosya" : trace ? "Kroki" : "—")} />
                <SummaryRow label="ÖLÇEK" value={`${scaleText} · ${unitLabel}`} />
                <SummaryRow label="PARSEL" value={`${Math.round(parsel.areaM2).toLocaleString("tr-TR")} m² · ${Math.round(parsel.widthCm / 100)} × ${Math.round(parsel.lengthCm / 100)} m`} />
                <SummaryRow
                  label="KONUM"
                  value={trace ? (trace.locked ? "Parsel üzerine yerleştirildi" : "Henüz yerleştirilmedi") : "—"}
                  last
                />
              </div>
              <div style={{ textAlign: "center", color: "#64748b", fontSize: 13.5, margin: "20px 0" }}>
                Krokini 2B çizime hazır hale getirdik.
              </div>
              <button style={{ ...primaryBtn, width: "100%", padding: "13px", fontSize: 14 }} onClick={finish}>
                2B Çizime Başla →
              </button>
            </div>
          )}
        </div>

        <div style={{ maxWidth: 640, width: "100%", margin: "24px auto 0", display: "flex", justifyContent: "space-between" }}>
          <button style={{ ...ghostBtn, opacity: step === 1 ? 0.4 : 1 }} onClick={goBack} disabled={step === 1}>
            ← Geri
          </button>
          {step < 4 && (
            <button style={{ ...primaryBtn, opacity: stepComplete[step] ? 1 : 0.4, cursor: stepComplete[step] ? "pointer" : "not-allowed" }} onClick={goNext} disabled={!stepComplete[step]}>
              İleri →
            </button>
          )}
        </div>
      </div>

      {/* Sağ: Parsel Özeti */}
      <div style={{ width: 260, flexShrink: 0, background: "#ffffff", borderLeft: "1px solid #e2e8f0", padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>📍 Parsel Özeti</div>
          <button
            onClick={() => setEditingParsel((v) => !v)}
            style={{ background: "none", border: "none", color: "var(--primary-blue)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            {editingParsel ? "Tamam" : "Düzenle"}
          </button>
        </div>

        {editingParsel ? (
          <>
            <FieldRow label="Genişlik (m)">
              <input
                type="number"
                defaultValue={Math.round(parsel.widthCm / 100)}
                onBlur={(e) => setParselInfo({ widthCm: (Number(e.target.value) || parsel.widthCm / 100) * 100 })}
                style={inputStyle}
              />
            </FieldRow>
            <FieldRow label="Derinlik (m)">
              <input
                type="number"
                defaultValue={Math.round(parsel.lengthCm / 100)}
                onBlur={(e) => setParselInfo({ lengthCm: (Number(e.target.value) || parsel.lengthCm / 100) * 100 })}
                style={inputStyle}
              />
            </FieldRow>
          </>
        ) : (
          <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Alan</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{Math.round(parsel.areaM2).toLocaleString("tr-TR")} m²</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Boyut</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
                {Math.round(parsel.widthCm / 100)} m × {Math.round(parsel.lengthCm / 100)} m
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#22c55e", fontWeight: 600 }}>
              <span>✓</span> Parsel bilgileri hazır
            </div>
          </div>
        )}

        {uploadedFile && (
          <div style={{ ...cardStyle, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", marginBottom: 8, letterSpacing: "0.03em" }}>DOSYA</div>
            <div style={{ fontSize: 12, color: "#334155", marginBottom: 4 }}>{uploadedFile.name.split(".").pop()?.toUpperCase()} dosyası</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
        )}

        <div
          onClick={() => setShowTips((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748b", cursor: "pointer", userSelect: "none" }}
        >
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>?</span>
          İpuçları
        </div>
        {showTips && (
          <ul style={{ fontSize: 11.5, color: "#64748b", paddingLeft: 18, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Krokide ölçü birimleri net değilse, "Ölçüyü Belirle" adımında ayarlayabilirsiniz.</li>
            <li>Parsel ile eşleştirme için önce Parsel Özeti'ni doğru girdiğinizden emin olun.</li>
            <li>Yüklediğiniz dosya çok büyükse uygulama yavaşlayabilir.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid #f1f5f9",
      }}
    >
      <span style={{ color: "#22c55e", fontSize: 15 }}>✓</span>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.03em" }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>{value}</div>
      </div>
    </div>
  );
}
