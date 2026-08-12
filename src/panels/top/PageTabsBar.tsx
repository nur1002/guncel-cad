import { useStore } from "../../engine/core/store";

export default function PageTabsBar() {
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const createPage = useStore((s) => s.createPage);
  const pushToast = useStore((s) => s.pushToast);

  const handleAddPage = () => {
    const name = window.prompt("Yeni Kat Adı:", `Kat ${pages.length + 1}`);
    if (name && name.trim()) {
      const lastKot = pages.length > 0 ? pages[pages.length - 1].kotElevationCm + pages[pages.length - 1].heightCm : 0;
      const createdId = createPage(name.trim(), "konut", lastKot, 280);
      pushToast(`"${name.trim()}" katı eklendi.`, "basari");
      setActivePageId(createdId);
    }
  };

  return (
    <div
      className="floor-tabs-bar"
      style={{
        height: "40px",
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "0 16px",
        gap: "4px",
        flexShrink: 0,
        overflowX: "auto",
        boxSizing: "border-box"
      }}
    >
      {pages.map((p) => {
        const isActive = p.id === activePageId;
        return (
          <div
            key={p.id}
            onClick={() => setActivePageId(p.id)}
            style={{
              padding: "0 16px",
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderBottom: isActive ? "2px solid var(--primary-blue)" : "2px solid transparent",
              fontSize: "13px",
              fontWeight: isActive ? "600" : "500",
              color: isActive ? "var(--primary-blue)" : "#64748b",
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxSizing: "border-box",
              userSelect: "none"
            }}
          >
            <span>{p.name}</span>
            {pages.length > 1 && (
              <span
                style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "8px", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`"${p.name}" katını silmek istediğinize emin misiniz?`)) {
                    useStore.getState().deletePage(p.id);
                    pushToast(`"${p.name}" katı silindi.`, "bilgi");
                  }
                }}
                title="Katı Sil"
              >
                ✕
              </span>
            )}
          </div>
        );
      })}
      <button
        onClick={handleAddPage}
        style={{
          background: "none",
          border: "none",
          color: "var(--primary-blue)",
          fontSize: "18px",
          fontWeight: "bold",
          cursor: "pointer",
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          height: "40px",
          boxSizing: "border-box"
        }}
        title="Yeni Kat Ekle"
      >
        +
      </button>
    </div>
  );
}
