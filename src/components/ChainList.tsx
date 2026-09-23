import { useMemo, useState } from "react";
import {
  boardMetrics,
  buildChains,
  chainsByStage,
  STAGES,
  type Stage,
} from "../rules/chainRules";
import { useChainStore } from "../hooks/useChainStore";
import ChainCard from "./ChainCard";

interface Props {
  selectedChainId: string | null;
  onOpen: (chainId: string) => void;
}

// 样本链列表 + 发育阶段筛选（筛选读链：链上任一卡处于该阶段即命中）。
export default function ChainList({ selectedChainId, onOpen }: Props) {
  const data = useChainStore();
  const [stage, setStage] = useState<Stage | "全部">("全部");

  const chains = useMemo(() => buildChains(data.records, data.sealedMasterIds), [data]);
  const filtered = useMemo(() => chainsByStage(chains, stage), [chains, stage]);
  const metrics = boardMetrics(data);

  return (
    <section className="panel list-panel">
      <div className="heading">
        <div>
          <p>样本批次</p>
          <h2>
            样本链列表 <small>{filtered.length} / {chains.length} 链</small>
          </h2>
        </div>
        <div className="legend">
          <span>{metrics.cardCount} 张登记卡</span>
          <span>{metrics.pendingReview} 张待复核</span>
        </div>
      </div>

      <div className="chips filter-chips">
        {(["全部", ...STAGES] as const).map((item) => (
          <button
            key={item}
            className={stage === item ? "on" : ""}
            onClick={() => setStage(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="chain-list">
        {filtered.length === 0 && (
          <p className="empty">当前筛选下没有样本链。</p>
        )}
        {filtered.map((chain) => (
          <ChainCard
            key={chain.id}
            chain={chain}
            onOpen={onOpen}
            active={chain.id === selectedChainId}
          />
        ))}
      </div>
    </section>
  );
}
