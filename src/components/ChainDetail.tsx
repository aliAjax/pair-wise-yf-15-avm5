import { useEffect, useState } from "react";
import { chainStore } from "../storage/chainStore";
import {
  buildChains,
  formatTime,
  type SampleChain,
  type SampleRecord,
} from "../rules/chainRules";
import { useChainStore } from "../hooks/useChainStore";

interface Props {
  chainId: string;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <p>{value || "—"}</p>
    </div>
  );
}

function RecordCard({ record, index }: { record: SampleRecord; index: number }) {
  return (
    <article className={`member-card ${record.master ? "master" : "supplement"}`}>
      <header>
        {record.master ? (
          <b className="master-tag">主记录 · 卡 {index + 1}</b>
        ) : (
          <em>
            补采 {index} · 卡 {index + 1}
          </em>
        )}
        {record.supplementStatus && <span className="review-tag">{record.supplementStatus}</span>}
      </header>
      <div className="detail-grid">
        <Field label="采集时间" value={formatTime(record.collectedAt)} />
        <Field label="环境温度" value={`${record.temperature.toFixed(1)} ℃`} />
        <Field label="暴露阶段" value={record.exposureStage} />
        <Field label="发育阶段" value={record.stage} />
        <Field label="昆虫种类" value={record.species} />
        <Field label="保存方式" value={record.preserve} />
        <Field label="采集备注" value={record.note} />
        <Field
          label="鉴定结果"
          value={
            record.master
              ? record.identification
              : record.identification ||
                (record.supplementStatus === "待复核" ? "（待复核，以主记录结论为准）" : "")
          }
        />
      </div>
    </article>
  );
}

export default function ChainDetail({ chainId, onClose }: Props) {
  const data = useChainStore();
  const chain: SampleChain | undefined = buildChains(data.records, data.sealedMasterIds).find(
    (item) => item.id === chainId,
  );
  const [draft, setDraft] = useState("");
  const [confirmSeal, setConfirmSeal] = useState(false);
  const [savedTip, setSavedTip] = useState(false);

  useEffect(() => {
    setDraft(chain?.master.identification ?? "");
    setConfirmSeal(false);
    setSavedTip(false);
  }, [chainId, chain?.master.identification]);

  if (!chain) {
    return (
      <section className="panel detail-panel">
        <p className="empty">该样本链不存在或已被清空。</p>
        <button className="ghost" onClick={onClose}>
          返回列表
        </button>
      </section>
    );
  }

  const saveIdentification = () => {
    chainStore.saveIdentification(chain.id, draft);
    setSavedTip(true);
    window.setTimeout(() => setSavedTip(false), 2000);
  };

  return (
    <section className="panel detail-panel">
      <div className="heading">
        <div>
          <p>单个样本详情卡片</p>
          <h2>
            <span className="case-tag">{chain.caseNo}</span> {chain.location}
            <small>
              {" "}
              · 采集日 {chain.collectedDay} · {chain.members.length} 张登记卡
            </small>
          </h2>
        </div>
        <div className="detail-actions">
          <span className={`state-badge ${chain.state === "已封存" ? "sealed" : "open"}`}>
            {chain.state}
          </span>
          <button className="ghost" onClick={onClose}>
            返回
          </button>
        </div>
      </div>

      <div className="identification-box">
        <label>
          <span>主记录鉴定结果（封存后只读；已有结果时新补采只标待复核，不覆盖此结论）</span>
          <textarea
            rows={3}
            value={draft}
            disabled={chain.state === "已封存"}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="在主记录上录入种属、发育级别、PMI 推断等鉴定结论"
          />
        </label>
        <div className="identification-actions">
          {chain.state === "开放" ? (
            <>
              <button
                className="primary"
                onClick={saveIdentification}
                disabled={draft.trim() === chain.master.identification.trim()}
              >
                {savedTip ? "已保存" : "保存鉴定结果"}
              </button>
              {confirmSeal ? (
                <>
                  <button className="danger" onClick={() => chainStore.seal(chain.id)}>
                    确认封存
                  </button>
                  <button className="ghost" onClick={() => setConfirmSeal(false)}>
                    取消
                  </button>
                </>
              ) : (
                <button className="ghost" onClick={() => setConfirmSeal(true)}>
                  封存主记录
                </button>
              )}
            </>
          ) : (
            <p className="muted">主记录已封存：鉴定结果只读，新补采申请将被退回，链上现有卡片不变。</p>
          )}
        </div>
      </div>

      <h3 className="members-title">样本链（按采集时间接续，首条为主记录）</h3>
      <div className="member-list">
        {chain.members.map((record, index) => (
          <RecordCard key={record.id} record={record} index={index} />
        ))}
      </div>
    </section>
  );
}
