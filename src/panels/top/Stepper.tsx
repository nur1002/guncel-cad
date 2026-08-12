import { useStore } from "../../engine/core/store";

const STAGES: { id: "kroki" | "cizim2d" | "3d" | "alan_yapi"; n: number; label: string }[] = [
  { id: "kroki", n: 1, label: "Kroki Yükleme" },
  { id: "cizim2d", n: 2, label: "2B Çizim" },
  { id: "3d", n: 3, label: "3B Görünüm" },
  { id: "alan_yapi", n: 4, label: "Alan / Yapı Bilgileri" },
];

export default function Stepper() {
  const workflowStage = useStore((s) => s.workflowStage);
  const setWorkflowStage = useStore((s) => s.setWorkflowStage);

  const currentIndex = STAGES.findIndex((s) => s.id === workflowStage);

  return (
    <div className="pro-stepper" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {STAGES.map((s, idx) => {
        const isActive = workflowStage === s.id;
        const isDone = idx < currentIndex;
        return (
          <div
            key={s.id}
            className={`pro-step ${isActive ? "pro-step--active" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: isActive ? "700" : "500",
              color: isActive ? "var(--primary-blue)" : isDone ? "#0f172a" : "#64748b",
              transition: "all 0.15s ease"
            }}
            onClick={() => {
              setWorkflowStage(s.id);
              if (s.id === "3d") {
                useStore.setState({ planMode: "3d" });
              } else if (s.id === "cizim2d") {
                useStore.setState({ planMode: "2d" });
              }
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: isActive ? "var(--primary-blue)" : isDone ? "#22c55e" : "#e2e8f0",
                color: isActive || isDone ? "#ffffff" : "#64748b",
                fontSize: "11px",
                fontWeight: "bold",
                marginRight: "6px",
              }}
            >
              {isDone ? "✓" : s.n}
            </span>
            <span style={{ marginRight: "10px" }}>{s.label}</span>
            {idx < STAGES.length - 1 && (
              <span style={{ marginRight: "10px", color: "#cbd5e1", fontWeight: "normal" }}>
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
