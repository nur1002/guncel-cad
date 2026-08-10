import { useStore } from "../engine/core/store";

const STAGES: { n: 1 | 2 | 3; label: string }[] = [
  { n: 1, label: "Kroki / Dosya Yükleme" },
  { n: 2, label: "2B Çizim" },
  { n: 3, label: "Alan / Yapı Bilgileri" },
];

export default function StageStepper() {
  const workflowStage = useStore((s) => s.workflowStage);
  const setWorkflowStage = useStore((s) => s.setWorkflowStage);

  return (
    <div className="stepper">
      {STAGES.map((s, i) => {
        const cls = s.n === workflowStage ? "active" : s.n < workflowStage ? "done" : "";
        return (
          <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
            <div className={`step ${cls}`} onClick={() => setWorkflowStage(s.n)}>
              <span className="num">{s.n < workflowStage ? "✓" : s.n}</span>
              {s.label}
            </div>
            {i < STAGES.length - 1 && <div className="step-sep" />}
          </div>
        );
      })}
    </div>
  );
}
