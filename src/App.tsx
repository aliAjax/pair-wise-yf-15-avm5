import { useMemo, useState } from "react";
import "./styles.css";
import { boardMetrics, buildChains } from "./rules/chainRules";
import { chainStore } from "./storage/chainStore";
import { useChainStore } from "./hooks/useChainStore";
import RegisterForm from "./components/RegisterForm";
import ChainList from "./components/ChainList";
import CaseBoard from "./components/CaseBoard";
import TemperatureChart from "./components/TemperatureChart";
import ChainDetail from "./components/ChainDetail";

type Tab = "register" | "list" | "cases" | "temperature";

const TABS: { key: Tab; label: string }[] = [
  { key: "register", label: "登记台" },
  { key: "list", label: "样本链列表" },
  { key: "cases", label: "案件关联" },
  { key: "temperature", label: "温度记录图" },
];

const RULES = [
  "案件编号 + 采样地点 + 采集日相同的登记卡收为一条样本链，首条为主记录，后续补采按采集时间接续。",
  "主记录已有鉴定结果时，补采只标“待复核”，主记录结论不被覆盖。",
  "主记录封存后，补采申请直接退回，原链照旧；列表、筛选、温度图、详情卡均读同一条链。",
];

function Metrics() {
  const data = useChainStore();
  const metrics = useMemo(() => boardMetrics(data), [data]);
  const cards = [
    { label: "样本链", value: metrics.chainCount, sub: `${metrics.cardCount} 张登记卡` },
    { label: "平均环境温度", value: `${metrics.avgTemperature.toFixed(1)}℃`, sub: "全卡片均值" },
    { label: "待复核补采", value: metrics.pendingReview, sub: "主记录已有结论" },
    { label: "已封存 / 退回", value: `${metrics.sealedCount} / ${metrics.rejectedCount}`, sub: "封存链 / 退回申请" },
  ];
  return (
    <section className="metrics">
      {cards.map((card) => (
        <article key={card.label}>
          <small>{card.label}</small>
          <strong>{card.value}</strong>
          <span>{card.sub}</span>
        </article>
      ))}
    </section>
  );
}

function App() {
  const data = useChainStore();
  const [tab, setTab] = useState<Tab>("list");
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);

  const openChain = (chainId: string) => {
    setSelectedChainId(chainId);
    setTab("list");
  };

  // 详情卡读链：选中链被删除（清空数据）后自动退出
  const selectedExists = useMemo(
    () =>
      selectedChainId
        ? buildChains(data.records, data.sealedMasterIds).some((chain) => chain.id === selectedChainId)
        : false,
    [data, selectedChainId],
  );

  return (
    <main className="app">
      <section className="hero">
        <p>法医昆虫学 · 样本登记台（规则 / 存储 / 页面分层）</p>
        <h1>法医昆虫学样本记录</h1>
        <ul className="rule-list">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <Metrics />

      <nav className="tabs">
        {TABS.map((item) => (
          <button
            key={item.key}
            className={tab === item.key && !selectedChainId ? "on" : ""}
            onClick={() => {
              setTab(item.key);
              if (item.key !== "list") setSelectedChainId(null);
            }}
          >
            {item.label}
          </button>
        ))}
        <div className="tabs-side">
          <button className="ghost small" onClick={() => chainStore.resetDemo()}>
            恢复演示数据
          </button>
          <button className="ghost small danger-ghost" onClick={() => chainStore.clearAll()}>
            清空全部
          </button>
        </div>
      </nav>

      {tab === "register" && <RegisterForm />}
      {tab === "list" &&
        (selectedChainId && selectedExists ? (
          <ChainDetail chainId={selectedChainId} onClose={() => setSelectedChainId(null)} />
        ) : (
          <ChainList selectedChainId={selectedChainId} onOpen={setSelectedChainId} />
        ))}
      {tab === "cases" && <CaseBoard onOpen={openChain} />}
      {tab === "temperature" && <TemperatureChart />}

      <footer className="footnote">
        数据仅保存在本浏览器 localStorage，关闭/重开浏览器后自动恢复；无后端、无额外依赖。
      </footer>
    </main>
  );
}

export default App;
