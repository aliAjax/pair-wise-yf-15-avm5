import { formatClock, formatCollectedAt } from "../domain/rules";
import { ReturnedApplication } from "../domain/types";

export default function ReturnedList({
  returned,
  onDismiss,
}: {
  returned: ReturnedApplication[];
  onDismiss: (id: string) => void;
}) {
  if (returned.length === 0) return null;
  return (
    <section className="panel returned-panel">
      <div className="heading">
        <div>
          <p>退回留痕</p>
          <h2>封存链退回的补采申请（{returned.length}）</h2>
        </div>
      </div>
      <div className="returned-list">
        {returned.map((item) => (
          <article key={item.id} className="returned-item">
            <div className="returned-body">
              <strong>
                {item.caseNo} · {item.location} · {item.date}
              </strong>
              <p>
                采样时间 {formatCollectedAt(item.collectedAt)} · 种类 {item.species || "未填"}
              </p>
              <p className="returned-reason">{item.reason}</p>
              <small>退回时间 {formatClock(item.returnedAt)}</small>
            </div>
            <button type="button" className="ghost" onClick={() => onDismiss(item.id)}>
              清除留痕
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
