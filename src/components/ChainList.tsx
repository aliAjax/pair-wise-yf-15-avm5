import { groupByCases, masterHasResult, masterOf } from "../domain/rules";
import { SampleChain } from "../domain/types";

function ChainBadges({ chain }: { chain: SampleChain }) {
  const pending = chain.records.filter((r) => r.reviewState === "pending").length;
  return (
    <div className="chain-badges">
      <span className="badge">{chain.records.length} 条记录</span>
      <span className={masterHasResult(chain) ? "badge result" : "badge muted"}>
        {masterHasResult(chain) ? "主记录有结论" : "主记录待鉴定"}
      </span>
      {pending > 0 && <span className="badge warn">待复核 ×{pending}</span>}
      {chain.sealed && <span className="badge sealed">已封存</span>}
    </div>
  );
}

function ChainRow({
  chain,
  selected,
  onSelect,
  onLock,
}: {
  chain: SampleChain;
  selected: boolean;
  onSelect: (id: string) => void;
  onLock: (chain: SampleChain) => void;
}) {
  const master = masterOf(chain);
  const supplements = chain.records.slice(1);
  const temps = chain.records
    .map((r) => r.temperature)
    .filter((t): t is number => t !== null);
  return (
    <article className={selected ? "chain-row selected" : "chain-row"} onClick={() => onSelect(chain.id)}>
      <div className="chain-row-head">
        <h3>
          <span className="chain-loc">{chain.location}</span>
          <small>
            采集日 {chain.date} · 链号 {chain.id.slice(-6).toUpperCase()}
          </small>
        </h3>
        <button
          type="button"
          className="ghost mini"
          disabled={chain.sealed}
          title={chain.sealed ? "已封存，不能再补采" : "沿用案件/地点/采集日，登记补采"}
          onClick={(e) => {
            e.stopPropagation();
            onLock(chain);
          }}
        >
          {chain.sealed ? "已封存" : "补采"}
        </button>
      </div>
      <p className="chain-master">
        <em>主记录</em>
        {master.species} · {master.stage} · {master.exposureStage}
        {master.temperature !== null ? ` · ${master.temperature}℃` : ""}
      </p>
      {supplements.length > 0 && (
        <p className="chain-supplements">
          <em>补采链</em>
          {supplements
            .map((r) => `${r.collectedAt.slice(11, 16)} ${r.species}${r.reviewState === "pending" ? "(待复核)" : ""}`)
            .join(" → ")}
        </p>
      )}
      <ChainBadges chain={chain} />
      {temps.length > 0 && (
        <small className="chain-temp">
          温度区间 {Math.min(...temps).toFixed(1)} ~ {Math.max(...temps).toFixed(1)} ℃
        </small>
      )}
    </article>
  );
}

export default function ChainList({
  chains,
  selectedId,
  filterLabel,
  onSelect,
  onLock,
}: {
  chains: SampleChain[];
  selectedId: string | null;
  filterLabel: string;
  onSelect: (id: string) => void;
  onLock: (chain: SampleChain) => void;
}) {
  const groups = groupByCases(chains);
  return (
    <section className="panel list-panel">
      <div className="heading">
        <div>
          <p>案件样本关联</p>
          <h2>样本链列表</h2>
        </div>
        <span className="filter-tag">阶段筛选：{filterLabel}</span>
      </div>
      {chains.length === 0 ? (
        <div className="empty">当前筛选下没有样本链</div>
      ) : (
        groups.map((group) => (
          <div key={group.caseNo} className="case-group">
            <div className="case-head">
              <strong>{group.caseNo}</strong>
              <span>{group.chains.length} 条样本链</span>
            </div>
            <div className="chain-rows">
              {group.chains.map((chain) => (
                <ChainRow
                  key={chain.id}
                  chain={chain}
                  selected={chain.id === selectedId}
                  onSelect={onSelect}
                  onLock={onLock}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export { ChainBadges };
