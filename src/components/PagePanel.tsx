import { useState } from "react";
import { useStore } from "../engine/store";
import type { Page } from "../data/model";

const PAGE_TYPES = [
  { id: "siginak", label: "Sığınak" },
  { id: "bodrum", label: "Bodrum Kat" },
  { id: "otopark", label: "Otopark" },
  { id: "dukkan", label: "Dükkan / Ticari Kat" },
  { id: "zemin", label: "Zemin Kat" },
  { id: "konut", label: "Konut Katı" },
  { id: "plaza", label: "Plaza Katı" },
  { id: "avm", label: "AVM Katı" },
  { id: "cati", label: "Çatı Katı" },
  { id: "teknik", label: "Teknik Kat / Daire" },
  { id: "depo", label: "Depo / Arşiv" },
];

export default function PagePanel() {
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const parsel = useStore((s) => s.parsel);

  const setActivePageId = useStore((s) => s.setActivePageId);
  const createPage = useStore((s) => s.createPage);
  const duplicatePage = useStore((s) => s.duplicatePage);
  const updatePageDetails = useStore((s) => s.updatePageDetails);
  const togglePageVisible = useStore((s) => s.togglePageVisible);
  const togglePageLocked = useStore((s) => s.togglePageLocked);
  const setPageOpacity = useStore((s) => s.setPageOpacity);
  const alignPagesToAnchor = useStore((s) => s.alignPagesToAnchor);
  const deletePage = useStore((s) => s.deletePage);
  const reorderPages = useStore((s) => s.reorderPages);
  const pushToast = useStore((s) => s.pushToast);

  // Modal State for New / Edit Page
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);

  // New Page Form State
  const [newName, setNewName] = useState("Yeni Sayfa");
  const [newType, setNewType] = useState("konut");
  const [newKot, setNewKot] = useState(300);
  const [newHeight, setNewHeight] = useState(280);

  // Anchor align state
  const [showAlignModal, setShowAlignModal] = useState(false);
  const [targetAlignPageId, setTargetAlignPageId] = useState("");
  const [refAlignPageId, setRefAlignPageId] = useState("");

  const handleCreatePage = (e: React.FormEvent) => {
    e.preventDefault();
    const createdId = createPage(newName, newType, newKot, newHeight);
    pushToast(`"${newName}" sayfası oluşturuldu.`, "basari");
    setShowNewModal(false);
    setActivePageId(createdId);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPage) return;
    updatePageDetails(editingPage.id, {
      name: editingPage.name,
      pageType: editingPage.pageType,
      kotElevationCm: editingPage.kotElevationCm,
      heightCm: editingPage.heightCm,
    });
    pushToast(`"${editingPage.name}" güncellendi.`, "basari");
    setEditingPage(null);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...pages];
    const temp = next[index];
    next[index] = next[index - 1];
    next[index - 1] = temp;
    reorderPages(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= pages.length - 1) return;
    const next = [...pages];
    const temp = next[index];
    next[index] = next[index + 1];
    next[index + 1] = temp;
    reorderPages(next);
  };

  return (
    <div className="page-panel-container">
      {/* 1. Parsel & Sabit Koordinat Bilgisi Header */}
      <div className="page-panel-header">
        <div className="panel-title-row">
          <h3>📄 SAYFALAR (PAGES)</h3>
          <button className="btn-add-page-small" title="Yeni Sayfa Ekle" onClick={() => setShowNewModal(true)}>
            + Yeni Sayfa
          </button>
        </div>
        <div className="parsel-info-card">
          <div className="parsel-stat-row">
            <span>📍 Parsel Alanı:</span>
            <strong>{parsel.areaM2} m² ({(parsel.widthCm / 100).toFixed(0)}m x {(parsel.lengthCm / 100).toFixed(0)}m)</strong>
          </div>
          <div className="parsel-stat-row">
            <span>🌐 Sabit Origin (0,0):</span>
            <span className="origin-badge">Sol Alt Köşe Ref</span>
          </div>
        </div>
      </div>

      {/* 2. Sayfalar Listesi */}
      <div className="page-list-scroll">
        {pages.map((page, index) => {
          const isActive = page.id === activePageId;
          const kotM = (page.kotElevationCm / 100).toFixed(2);
          const heightM = (page.heightCm / 100).toFixed(2);

          return (
            <div
              key={page.id}
              className={`page-item-card ${isActive ? "page-item-card--active" : ""}`}
              onClick={() => setActivePageId(page.id)}
            >
              {/* Top Item Row */}
              <div className="page-card-top">
                <div className="page-title-group">
                  <span className="page-icon">📄</span>
                  <span className="page-name">{page.name}</span>
                  {isActive && <span className="active-pill">Aktif Sayfa</span>}
                </div>

                <div className="page-quick-actions" onClick={(e) => e.stopPropagation()}>
                  {/* Görünürlük (Eye) */}
                  <button
                    className={`btn-icon-action ${page.visible ? "action-on" : "action-off"}`}
                    title={page.visible ? "Sayfayı Gizle" : "Sayfayı Göster"}
                    onClick={() => togglePageVisible(page.id)}
                  >
                    {page.visible ? "👁️" : "🙈"}
                  </button>

                  {/* Kilit (Lock) */}
                  <button
                    className={`btn-icon-action ${page.locked ? "action-locked" : ""}`}
                    title={page.locked ? "Sayfa Kilidini Aç" : "Sayfayı Kilitle"}
                    onClick={() => togglePageLocked(page.id)}
                  >
                    {page.locked ? "🔒" : "🔓"}
                  </button>

                  {/* Çoğalt (Kat Kopyala) */}
                  <button
                    className="btn-icon-action"
                    title="Bu Katın Çizimini Üst Kata Kopyala"
                    onClick={() => duplicatePage(page.id, `${page.name} Kopya`)}
                  >
                    📋
                  </button>

                  {/* Düzenle */}
                  <button
                    className="btn-icon-action"
                    title="Sayfa Bilgilerini Düzenle"
                    onClick={() => setEditingPage(page)}
                  >
                    ✏️
                  </button>

                  {/* Sil */}
                  <button
                    className="btn-icon-action btn-icon-delete"
                    title="Sayfayı Sil"
                    onClick={() => deletePage(page.id)}
                  >
                    🗑️
                  </button>

                  {/* Sıralama */}
                  <button className="btn-icon-action" title="Yukarı Taşı" onClick={() => handleMoveUp(index)}>
                    ▲
                  </button>
                  <button className="btn-icon-action" title="Aşağı Taşı" onClick={() => handleMoveDown(index)}>
                    ▼
                  </button>
                </div>
              </div>

              {/* Bottom Specs Row (Kot, Yükseklik, Şeffaflık) */}
              <div className="page-card-bottom" onClick={(e) => e.stopPropagation()}>
                <div className="page-spec-pill">
                  Kot: <strong>{kotM > "0" ? `+${kotM}` : kotM} m</strong>
                </div>
                <div className="page-spec-pill">
                  Yükseklik: <strong>{heightM} m</strong>
                </div>

                {/* Ghost Opacity Selector */}
                <div className="opacity-selector-group">
                  <span className="opacity-label">Şeffaflık:</span>
                  {[0.2, 0.4, 0.6, 1.0].map((op) => (
                    <button
                      key={op}
                      className={`btn-opacity-chip ${page.opacity === op ? "btn-opacity-chip--active" : ""}`}
                      onClick={() => setPageOpacity(page.id, op)}
                    >
                      %{Math.round(op * 100)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Hizalama / Anchor Actions Footer */}
      <div className="page-panel-footer">
        <button className="btn-anchor-align-full" onClick={() => setShowAlignModal(true)}>
          📍 Üst Üste Hizala (Anchor Alignment)
        </button>
      </div>

      {/* --- Yeni Sayfa Modal --- */}
      {showNewModal && (
        <div className="modal-backdrop">
          <div className="cad-modal-box">
            <div className="cad-modal-header">
              <h3>📄 Yeni Sayfa Oluştur</h3>
              <span className="card-close-x" onClick={() => setShowNewModal(false)}>
                ✕
              </span>
            </div>
            <form onSubmit={handleCreatePage} className="cad-modal-body">
              <label className="modal-field">
                <span>Sayfa Adı</span>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </label>

              <label className="modal-field">
                <span>Sayfa Tipi / Amacı</span>
                <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {PAGE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="modal-field">
                <span>Kot Yüksekliği Z (cm)</span>
                <input
                  type="number"
                  value={newKot}
                  onChange={(e) => setNewKot(Number(e.target.value))}
                  placeholder="Örn: 300 (3.00m)"
                />
              </label>

              <label className="modal-field">
                <span>Kat Yüksekliği (cm)</span>
                <input
                  type="number"
                  value={newHeight}
                  onChange={(e) => setNewHeight(Number(e.target.value))}
                  placeholder="Örn: 280 (2.80m)"
                />
              </label>

              <div className="modal-footer-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowNewModal(false)}>
                  İptal
                </button>
                <button type="submit" className="btn-modal-submit">
                  + Sayfa Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Sayfa Düzenle Modal --- */}
      {editingPage && (
        <div className="modal-backdrop">
          <div className="cad-modal-box">
            <div className="cad-modal-header">
              <h3>✏️ Sayfa Bilgilerini Düzenle</h3>
              <span className="card-close-x" onClick={() => setEditingPage(null)}>
                ✕
              </span>
            </div>
            <form onSubmit={handleSaveEdit} className="cad-modal-body">
              <label className="modal-field">
                <span>Sayfa Adı</span>
                <input
                  type="text"
                  value={editingPage.name}
                  onChange={(e) => setEditingPage({ ...editingPage, name: e.target.value })}
                  required
                />
              </label>

              <label className="modal-field">
                <span>Sayfa Tipi</span>
                <select
                  value={editingPage.pageType}
                  onChange={(e) => setEditingPage({ ...editingPage, pageType: e.target.value })}
                >
                  {PAGE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="modal-field">
                <span>Kot Yüksekliği Z (cm)</span>
                <input
                  type="number"
                  value={editingPage.kotElevationCm}
                  onChange={(e) => setEditingPage({ ...editingPage, kotElevationCm: Number(e.target.value) })}
                />
              </label>

              <label className="modal-field">
                <span>Kat Yüksekliği (cm)</span>
                <input
                  type="number"
                  value={editingPage.heightCm}
                  onChange={(e) => setEditingPage({ ...editingPage, heightCm: Number(e.target.value) })}
                />
              </label>

              <div className="modal-footer-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setEditingPage(null)}>
                  İptal
                </button>
                <button type="submit" className="btn-modal-submit">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Anchor Hizalama Modal --- */}
      {showAlignModal && (
        <div className="modal-backdrop">
          <div className="cad-modal-box">
            <div className="cad-modal-header">
              <h3>📍 Sayfaları Üst Üste Hizala</h3>
              <span className="card-close-x" onClick={() => setShowAlignModal(false)}>
                ✕
              </span>
            </div>
            <div className="cad-modal-body">
              <p style={{ fontSize: "12px", color: "#64748b" }}>
                Hedef sayfayı referans sayfanın Anchor (Referans) koordinatlarına tam üst üste oturacak şekilde otomatik hizalayın.
              </p>

              <label className="modal-field">
                <span>Hizalanacak Hedef Sayfa</span>
                <select value={targetAlignPageId} onChange={(e) => setTargetAlignPageId(e.target.value)}>
                  <option value="">-- Hedef Sayfa Seçin --</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="modal-field">
                <span>Referans Alınacak Sayfa</span>
                <select value={refAlignPageId} onChange={(e) => setRefAlignPageId(e.target.value)}>
                  <option value="">-- Referans Sayfa Seçin --</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="modal-footer-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowAlignModal(false)}>
                  Kapat
                </button>
                <button
                  type="button"
                  className="btn-modal-submit"
                  disabled={!targetAlignPageId || !refAlignPageId}
                  onClick={() => {
                    alignPagesToAnchor(targetAlignPageId, refAlignPageId);
                    pushToast("Sayfalar başarıyla üst üste hizalandı.", "basari");
                    setShowAlignModal(false);
                  }}
                >
                  🎯 Hizala
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
