import { useStore } from "../../engine/core/store";

export default function ToolDock() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const pushToast = useStore((s) => s.pushToast);

  const handleSoon = (name: string) => {
    pushToast(`${name} aracı yakında eklenecek.`, "bilgi");
  };

  const sections = [
    {
      title: "ÇİZİM",
      items: [
        { label: "Duvar", icon: "✏️", active: activeTool === "wall", primary: true, action: () => setTool("wall") },
        { label: "Bina Dış Sınırı", icon: "⬛", active: activeTool === "buildingOutline", action: () => setTool("buildingOutline") },
        { label: "Çizgi", icon: "╱", action: () => handleSoon("Çizgi") },
        { label: "Poligon", icon: "⬡", action: () => handleSoon("Poligon") },
        { label: "Dikdörtgen", icon: "▭", action: () => handleSoon("Dikdörtgen") },
        { label: "Daire", icon: "◯", action: () => handleSoon("Daire") },
        { label: "Yay", icon: "⌒", action: () => handleSoon("Yay") },
      ],
    },
    {
      title: "DÜZENLEME",
      items: [
        { label: "Seç", icon: "⬈", active: activeTool === "select", action: () => setTool("select") },
        { label: "Taşı", icon: "✥", action: () => handleSoon("Taşı") },
        { label: "Kopyala", icon: "❑", action: () => handleSoon("Kopyala") },
        { label: "Sil", icon: "🗑", action: () => deleteSelection() },
        { label: "Döndür", icon: "↻", action: () => handleSoon("Döndür") },
        { label: "Aynala", icon: "🪞", action: () => handleSoon("Aynala") },
        { label: "Offset", icon: "⇄", active: activeTool === "offset", action: () => setTool("offset") },
        { label: "Trim", icon: "✂", active: activeTool === "trim", action: () => setTool("trim") },
        { label: "Extend", icon: "⤢", active: activeTool === "extend", action: () => setTool("extend") },
        { label: "Fillet", icon: "⌒", action: () => handleSoon("Fillet") },
      ],
    },
    {
      title: "ÖLÇÜ",
      items: [
        { label: "Mesafe Ölç", icon: "📏", active: activeTool === "measure", action: () => setTool("measure") },
        { label: "Alan Ölç", icon: "📐", action: () => handleSoon("Alan Ölç") },
        { label: "Açı Ölç", icon: "📐", action: () => handleSoon("Açı Ölç") },
        { label: "Not Ekle", icon: "📝", action: () => handleSoon("Not Ekle") },
      ],
    },
  ];

  return (
    <div
      className="floating-tool-palette"
      style={{
        position: "fixed",
        bottom: "100px",
        left: "80px",
        width: "360px",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        zIndex: 1000,
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        boxSizing: "border-box"
      }}
    >
      {sections.map((sec) => (
        <div key={sec.title} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "#94a3b8",
              letterSpacing: "0.05em",
              borderBottom: "1px solid #f1f5f9",
              paddingBottom: "2px",
              marginBottom: "2px"
            }}
          >
            {sec.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {sec.items.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                title={item.primary ? "En sık kullanılan araç" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: item.primary ? "6px 12px" : "4px 8px",
                  borderRadius: "4px",
                  border: "1px solid " + (item.active ? "var(--primary-blue)" : item.primary ? "var(--primary-blue)" : "#cbd5e1"),
                  background: item.active || item.primary ? "var(--primary-blue-light)" : "#ffffff",
                  color: item.active || item.primary ? "var(--primary-blue)" : "#334155",
                  fontSize: item.primary ? "12px" : "11px",
                  fontWeight: item.primary ? "700" : "500",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
