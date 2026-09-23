import type { SampleChain } from "../rules/chainRules";
import { formatTime } from "../rules/chainRules";

interface Props {
  chain: SampleChain;
  onOpen: (chainId: string) => void;
  active?: boolean;
}

const STAGE_COLOR: Record<string, string> = {
  卵: "#a16207",
  幼虫: "#365314",
  蛹: "#7c3aed",
  成虫: "#dc2626",
};

// 样本链列表条目：主记录打头，补采按采集时间接在后面。
export default function ChainCard({ chain, onOpen, active }: Props) {
  return (
    <article className={`chain-card ${active ? "active" : ""}`} onClick={() => onOpen(chain.id)}>
      <header className="chain-card-head">
        <div>
          <h3>
            <span className="case-tag">{chain.caseNo}</span>
            {chain.location}
          </h3>
          <p className="chain-day">
            采集日 {chain.collectedDay} · 共 {chain.members.length} 张登记卡
          </p>
        </div>
        <span className={`state-badge ${chain.state === "已封存" ? "sealed" : "open"}`}>
          {chain.state}
        </span>
      </header>

      <ol className="chain-timeline-mini">
        {chain.members.map((member, index) => (
          <li key={member.id} className={member.master ? "is-master" : "is-supplement"}>
            <span className="dot" style={{ background: STAGE_COLOR[member.stage] }} />
            <div>
              <p>
                {member.master ? <b className="master-tag">主记录</b> : <em>补采 {index}</em>}
                <span className="stage-chip" style={{ color: STAGE_COLOR[member.stage] }}>
                  {member.stage}
                </span>
                {member.supplementStatus && (
                  <span className="review-tag">{member.supplementStatus}</span>
                )}
              </p>
              <small>
                {formatTime(member.collectedAt)} · {member.species} · {member.temperature.toFixed(1)}
                ℃
              </small>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
