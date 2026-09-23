import { useMemo } from "react";
import { buildChains, chainsByCase, formatTime } from "../rules/chainRules";
import { useChainStore } from "../hooks/useChainStore";

interface Props {
  onOpen: (chainId: string) => void;
}

// 案件样本关联页：按案件分组，每条采集日链挂在案件下；同时列出被退回的补采申请。
export default function CaseBoard({ onOpen }: Props) {
  const data = useChainStore();
  const groups = useMemo(
    () => chainsByCase(buildChains(data.records, data.sealedMasterIds)),
    [data],
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>案件样本关联</p>
          <h2>案件 → 采样地点 / 采集日样本链</h2>
        </div>
      </div>

      <div className="case-groups">
        {groups.map((group) => {
          const cardCount = group.chains.reduce((sum, chain) => sum + chain.members.length, 0);
          const pending = group.chains.reduce(
            (sum, chain) =>
              sum +
              chain.supplements.filter((item) => item.supplementStatus === "待复核").length,
            0,
          );
          return (
            <article key={group.caseNo} className="case-group">
              <header>
                <h3>
                  <span className="case-tag">{group.caseNo}</span>
                </h3>
                <p>
                  {group.chains.length} 条链 · {cardCount} 张卡
                  {pending > 0 && <em className="inline-review"> · {pending} 张待复核</em>}
                </p>
              </header>
              <ul className="case-chain-rows">
                {group.chains.map((chain) => (
                  <li
                    key={chain.id}
                    className="case-chain-row"
                    onClick={() => onOpen(chain.id)}
                  >
                    <div>
                      <b>{chain.location}</b>
                      <small>
                        {chain.collectedDay} · {chain.members.length} 卡 ·{" "}
                        {chain.members
                          .map((member) => `${formatTime(member.collectedAt)} ${member.stage}`)
                          .join(" / ")}
                      </small>
                    </div>
                    <span className={`state-badge ${chain.state === "已封存" ? "sealed" : "open"}`}>
                      {chain.state}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="rejection-block">
        <h3>被退回的补采申请（{data.rejections.length}）</h3>
        <p className="muted">主记录封存后提交的补采不入链，仅在此留痕，原链保持不变。</p>
        {data.rejections.length === 0 && <p className="empty">暂无退回记录。</p>}
        <ul className="rejection-list">
          {[...data.rejections]
            .sort((a, b) => b.rejectedAt.localeCompare(a.rejectedAt))
            .map((item) => (
              <li key={item.id}>
                <div>
                  <b>
                    {item.input.caseNo} · {item.input.location}
                  </b>
                  <small>
                    采集时间 {formatTime(item.input.collectedAt)} ·{" "}
                    {item.input.species} · {item.input.temperature.toFixed(1)}℃
                  </small>
                </div>
                <em className="reject-reason">{item.reason}</em>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}
