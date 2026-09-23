import { RegistrySummary } from "../domain/rules";

const CARDS: { key: keyof RegistrySummary; label: string }[] = [
  { key: "chainCount", label: "样本链" },
  { key: "recordCount", label: "登记记录" },
  { key: "pendingReview", label: "待复核补采" },
  { key: "returnedCount", label: "退回申请" },
];

export default function MetricStrip({ summary }: { summary: RegistrySummary }) {
  return (
    <section className="metrics">
      {CARDS.map((card) => (
        <article key={card.label}>
          <small>{card.label}</small>
          <strong>{summary[card.key]}</strong>
        </article>
      ))}
      <article>
        <small>平均环境温度</small>
        <strong>{summary.avgTemperature === null ? "—" : `${summary.avgTemperature}℃`}</strong>
      </article>
    </section>
  );
}
