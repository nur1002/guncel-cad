import { useStore } from "../../engine/core/store";

interface RailItem {
  id: string;
  label: string;
  icon: string;
}

export default function LeftNavRail() {
  const workflowStage = useStore((s) => s.workflowStage);
  const activeRailTab = useStore((s) => s.activeRailTab);
  const setActiveRailTab = useStore((s) => s.setActiveRailTab);
  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const toggleLeftRail = useStore((s) => s.toggleLeftRail);

  // Define rail items dynamically based on workflow stage
  let items: RailItem[] = [];

  if (workflowStage === "3d") {
    items = [
      { id: "home", label: "Proje", icon: "📋" },
      { id: "sayfalar", label: "Katlar", icon: "🥞" },
      { id: "kesitler", label: "Kesitler", icon: "📐" },
      { id: "gorunumler", label: "Görünümler", icon: "👁️" },
      { id: "mekanlar", label: "Mekânlar", icon: "🏠" },
      { id: "bilesenler", label: "Bileşenler", icon: "🧱" },
      { id: "analiz", label: "Analiz", icon: "📊" },
      { id: "raporlar", label: "Raporlar", icon: "📋" },
      { id: "ayarlar", label: "Ayarlar", icon: "⚙️" },
    ];
  } else if (workflowStage === "kroki") {
    items = [
      { id: "home", label: "Proje", icon: "📋" },
      { id: "mekanlar", label: "Mekânlar", icon: "🏠" },
      { id: "bilesenler", label: "Bileşenler", icon: "🧱" },
      { id: "duvarlar", label: "Duvarlar", icon: "🧱" },
      { id: "olculendirme", label: "Ölçülendirme", icon: "📐" },
      { id: "katmanlar", label: "Katmanlar", icon: "🥞" },
      { id: "sayfalar", label: "Sayfalar", icon: "📄" },
      { id: "parsel", label: "Parsel", icon: "🗺️" },
      { id: "koordinat", label: "Koordinat", icon: "🎯" },
      { id: "analiz", label: "Analiz", icon: "📊" },
      { id: "ayarlar", label: "Ayarlar", icon: "⚙️" },
    ];
  } else {
    // 2D Drawing default
    items = [
      { id: "home", label: "Proje", icon: "📋" },
      { id: "mekanlar", label: "Mekânlar", icon: "🏠" },
      { id: "bilesenler", label: "Bileşenler", icon: "🧱" },
      { id: "olculer", label: "Ölçüler", icon: "📏" },
      { id: "olculendirme", label: "Ölçülendirme", icon: "📐" },
      { id: "katmanlar", label: "Katmanlar", icon: "🥞" },
      { id: "sayfalar", label: "Sayfalar", icon: "📄" },
      { id: "parsel", label: "Parsel", icon: "🗺️" },
      { id: "koordinat", label: "Koordinat", icon: "🎯" },
      { id: "analiz", label: "Analiz", icon: "📊" },
      { id: "ayarlar", label: "Ayarlar", icon: "⚙️" },
    ];
  }

  // Adjust activeRailTab if not in items list
  const currentTab = items.find((it) => it.id === activeRailTab) ? activeRailTab : items[0]?.id;

  return (
    <div
      style={{
        width: "64px",
        background: "#f8fafc", // açık gri arka plan
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "8px 0",
        flexShrink: 0,
        boxSizing: "border-box",
        borderRight: "1px solid #e2e8f0",
        zIndex: 50
      }}
    >
      {items.map((item) => {
        const isActive = item.id === currentTab;
        return (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === currentTab && leftRailOpen) {
                toggleLeftRail();
              } else {
                setActiveRailTab(item.id);
                if (!leftRailOpen) toggleLeftRail();
              }
            }}
            style={{
              background: isActive ? "#eff6ff" : "transparent",
              border: "none",
              padding: "10px 4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
              width: "100%",
              boxSizing: "border-box",
              color: isActive ? "#2563eb" : "#64748b",
            }}
            title={item.label}
          >
            <span style={{ fontSize: "18px", marginBottom: "4px" }}>
              {item.icon}
            </span>
            <span
              style={{
                fontSize: "9px",
                fontWeight: "500",
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                width: "100%"
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
