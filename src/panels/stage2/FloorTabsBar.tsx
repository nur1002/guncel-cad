import { useStore } from "../../engine/core/store";

export default function FloorTabsBar() {
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const createPage = useStore((s) => s.createPage);

  return (
    <div className="floortabs">
      {pages.map((p) => (
        <div key={p.id} className={`ftab ${p.id === activePageId ? "active" : ""}`} onClick={() => setActivePageId(p.id)}>
          {p.name}
        </div>
      ))}
      <button
        className="ftab-add"
        title="Yeni Sayfa Ekle"
        onClick={() => {
          const name = window.prompt("Yeni Sayfa Adı:", `Kat ${pages.length + 1}`);
          if (name && name.trim()) {
            const lastKot = pages.length > 0 ? pages[pages.length - 1].kotElevationCm + pages[pages.length - 1].heightCm : 0;
            const createdId = createPage(name.trim(), "konut", lastKot, 280);
            setActivePageId(createdId);
          }
        }}
      >
        +
      </button>
    </div>
  );
}
