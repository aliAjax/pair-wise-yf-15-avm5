import { useEffect, useState } from "react";
import { formatClock, formatCollectedAt, masterHasResult, masterOf } from "../domain/rules";
import { SampleChain, SampleRecord } from "../domain/types";
import TemperatureChart from "./TemperatureChart";

function ReviewTag({ state }: { state: SampleRecord["reviewState"] }) {
  if (state === "pending") return <span className="badge warn">待复核</span>;
  if (state === "reviewed") return <span className="badge result">已复核</span>;
  return null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <p>{value || "—"}</p>
    </div>
  );
}

function RecordCard({
  record,
  chain,
  onReview,
}: {
  record: SampleRecord;
  chain: SampleChain;
  onReview: (chainId: string, recordId: string, verdict: "reviewed" | "pending") => void;
}) {
  const isMaster = record.role === "master";
  return (
    <article className={isMaster ? "record-card master" : "record-card"}>
      <header>
        <div>
          <em className={isMaster ? "role-tag master-tag" : "role-tag"}>{isMaster ? "主记录" : "补采"}</em>
          <strong>{record.species}</strong>
          {!isMaster && <ReviewTag state={record.reviewState} />}
        </div>
        <time>{formatCollectedAt(record.collectedAt)}</time>
      </header>
      <div className="detail-fields">
        <Field label="发育阶段" value={record.stage} />
        <Field label="暴露阶段" value={record.exposureStage} />
        <Field label="环境温度" value={record.temperature === null ? "—" : `${record.temperature} ℃`} />
        <Field label="保存方式" value={record.preservation} />
        <Field label="采样地点" value={record.location} />
        <Field label="登记时间" value={formatClock(record.registeredAt)} />
      </div>
      <div className="detail-note">
        <span>鉴定备注</span>
        <p>{record.note || "无"}</p>
      </div>
      {!isMaster && !chain.sealed && (
        <footer className="record-actions">
          {record.reviewState !== "reviewed" ? (
            <button type="button" className="ghost mini" onClick={() => onReview(chain.id, record.id, "reviewed")}>
              复核通过
            </button>
          ) : (
            <button type="button" className="ghost mini" onClick={() => onReview(chain.id, record.id, "pending")}>
              重新标记待复核
            </button>
          )}
          <small>复核只改补采自身状态，主记录鉴定结果不会被覆盖</small>
        </footer>
      )}
    </article>
  );
}

export default function ChainDetail({
  chain,
  onSaveResult,
  onReview,
  onSeal,
  onLock,
}: {
  chain: SampleChain | null;
  onSaveResult: (chainId: string, note: string) => void;
  onReview: (chainId: string, recordId: string, verdict: "reviewed" | "pending") => void;
  onSeal: (chainId: string) => void;
  onLock: (chain: SampleChain) => void;
}) {
  const [resultDraft, setResultDraft] = useState("");

  useEffect(() => {
    setResultDraft(chain ? masterOf(chain).note : "");
  }, [chain]);

  if (!chain) {
    return (
      <section className="panel detail-panel">
        <div className="empty tall">从左侧选择一条样本链，查看主记录、补采时间线与温度记录图</div>
      </section>
    );
  }

  const master = masterOf(chain);
  const hasResult = masterHasResult(chain);
  const resultChanged = resultDraft.trim() !== master.note.trim();

  return (
    <section className="panel detail-panel">
      <div className="heading">
        <div>
          <p>单个样本详情卡片</p>
          <h2>
            {chain.caseNo} · {chain.location}
          </h2>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" disabled={chain.sealed} onClick={() => onLock(chain)}>
            登记同链补采
          </button>
          {!chain.sealed && (
            <button
              type="button"
              className="seal-btn"
              onClick={() => {
                if (window.confirm("封存后不可解封，之后同案件/地点/采集日的补采申请将被退回。确认封存主记录？")) {
                  onSeal(chain.id);
                }
              }}
            >
              封存主记录
            </button>
          )}
        </div>
      </div>

      <div className="chain-meta">
        <span>采集日 {chain.date}</span>
        <span>建链时间 {formatClock(chain.createdAt)}</span>
        {chain.sealed && (
          <span className="badge sealed">
            已封存（{chain.sealedAt ? formatClock(chain.sealedAt) : "时间未知"}）· 补采申请将退回
          </span>
        )}
      </div>

      <div className="result-box">
        <label>
          <span>主记录鉴定结果（链结论；补采备注不会覆盖此处）</span>
          <textarea
            rows={2}
            value={resultDraft}
            disabled={chain.sealed}
            placeholder="主记录尚无鉴定结果时，补采正常接续；一旦录入结论，新补采只标待复核"
            onChange={(e) => setResultDraft(e.target.value)}
          />
        </label>
        <div className="result-side">
          <span className={hasResult ? "state-dot has" : "state-dot"}>{hasResult ? "已有结论" : "待鉴定"}</span>
          <button
            type="button"
            className="primary mini"
            disabled={chain.sealed || !resultChanged || resultDraft.trim().length === 0}
            onClick={() => onSaveResult(chain.id, resultDraft)}
          >
            保存鉴定结果
          </button>
          <small>{chain.sealed ? "链已封存，鉴定结果只读" : "保存后，后续新补采自动标记待复核"}</small>
        </div>
      </div>

      <div className="chart-box">
        <h4>温度记录图（整条链 {chain.records.length} 次采样）</h4>
        <TemperatureChart records={chain.records} />
      </div>

      <div className="timeline">
        <h4>样本链时间线（首条为主记录，补采按采样时间接续）</h4>
        {chain.records.map((record) => (
          <RecordCard key={record.id} record={record} chain={chain} onReview={onReview} />
        ))}
      </div>
    </section>
  );
}
