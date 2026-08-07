import { useStore } from "../../engine/core/store";

export default function CategoryTabs() {
  const categoryTabs = useStore((s) => s.categoryTabs);
  const activeCategoryTabId = useStore((s) => s.activeCategoryTabId);
  const setActiveCategoryTab = useStore((s) => s.setActiveCategoryTab);
  const openCatalogFor = useStore((s) => s.openCatalogFor);
  const layerVisibility = useStore((s) => s.layerVisibility);
  const toggleLayer = useStore((s) => s.toggleLayer);

  return (
    <div className="category-tabs">
      {categoryTabs.map((tab) => (
        <div key={tab.id} className={`category-tab ${activeCategoryTabId === tab.id ? "category-tab--active" : ""}`}>
          <button
            className="category-tab-label"
            onClick={() => {
              setActiveCategoryTab(tab.id);
              if (tab.catalogCategoryId) openCatalogFor(tab.catalogCategoryId);
            }}
          >
            {tab.label}
          </button>
          <button
            className="category-tab-eye"
            title={layerVisibility[tab.id] === false ? "Katmanı göster" : "Katmanı gizle"}
            onClick={(e) => {
              e.stopPropagation();
              toggleLayer(tab.id);
            }}
          >
            {layerVisibility[tab.id] === false ? "🚫" : "👁"}
          </button>
        </div>
      ))}
    </div>
  );
}
