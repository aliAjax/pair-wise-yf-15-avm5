import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  chainMatchesStage,
  dismissReturned,
  recordMasterResult,
  reviewSupplement,
  sealChain,
  sortChains,
  submitApplication,
  summarize,
} from "./domain/rules";
import { RegistryState, SampleChain, SampleDraft, Stage } from "./domain/types";
import { loadRegistry, saveRegistry } from "./storage/storage";
import MetricStrip from "./components/MetricStrip";
import StageFilterBar, { StageFilter } from "./components/StageFilterBar";
import RegistrationForm, { LockTarget, RegisterNotice } from "./components/RegistrationForm";
import ChainList from "./components/ChainList";
import ChainDetail from "./components/ChainDetail";
import ReturnedList from "./components/ReturnedList";

export default function App() {
  // 存储层恢复：浏览器重开后仍能读到全部样本链
  const [state, setState] = useState<RegistryState>(() => loadRegistry());
  const [stageFilter, setStageFilter] = useState<StageFilter>("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lock, setLock] = useState<LockTarget | null>(null);
  const [notice, setNotice] = useState<RegisterNotice | null>(null);

  // 每次状态变化落盘
  useEffect(() => {
    saveRegistry(state);
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const summary = useMemo(() => summarize(state), [state]);

  const sortedChains = useMemo(() => sortChains(state.chains), [state.chains]);

  const filterCounts = useMemo(() => {
    const counts: Record<StageFilter, number> = {
      全部: sortedChains.length,
      卵: 0,
      幼虫: 0,
      蛹: 0,
      成虫: 0,
    };
    for (const chain of sortedChains) {
      (["卵", "幼虫", "蛹", "成虫"] as Stage[]).forEach((s) => {
        if (chainMatchesStage(chain, s)) counts[s] += 1;
      });
    }
    return counts;
  }, [sortedChains]);

  const visibleChains = useMemo(
    () => sortedChains.filter((c) => chainMatchesStage(c, stageFilter)),
    [sortedChains, stageFilter],
  );

  const selectedChain = useMemo(
    () => state.chains.find((c) => c.id === selectedId) ?? null,
    [state.chains, selectedId],
  );

  // 登记台提交：走规则层（建新链 / 接续补采 / 待复核 / 退回）
  const handleSubmit = (draft: SampleDraft) => {
    const outcome = submitApplication(state, draft);
    setState(outcome.state);
    setNotice({ tone: outcome.kind === "returned" ? "warn" : "ok", text: outcome.message });
    if (outcome.chainId) setSelectedId(outcome.chainId);
  };

  const handleLock = (chain: SampleChain) => {
    setLock({ caseNo: chain.caseNo, location: chain.location, date: chain.date, sealed: chain.sealed });
    setSelectedId(chain.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveResult = (chainId: string, note: string) => {
    setState((prev) => recordMasterResult(prev, chainId, note));
    setNotice({ tone: "ok", text: "主记录鉴定结果已保存，在链补采已转为待复核，结论未被覆盖" });
  };

  const handleReview = (chainId: string, recordId: string, verdict: "reviewed" | "pending") => {
    setState((prev) => reviewSupplement(prev, chainId, recordId, verdict));
  };

  const handleSeal = (chainId: string) => {
    setState((prev) => sealChain(prev, chainId));
    setLock((prev) => (prev && state.chains.some((c) => c.id === chainId && c.caseNo === prev.caseNo && c.location === prev.location && c.date === prev.date)
      ? { ...prev, sealed: true }
      : prev));
    setNotice({ tone: "warn", text: "主记录已封存，之后同键补采申请将被退回，原链保持不变" });
  };

  const handleDismissReturned = (id: string) => {
    setState((prev) => dismissReturned(prev, id));
  };

  return (
    <main className="app">
      <header className="hero">
        <p>法医昆虫学样本登记台 · 样本链模式</p>
        <h1>同案同地同日收成一条样本链</h1>
        <span>
          案件编号、采样地点、采集日相同的记录自动归链：首条登记为主记录，后续补采按采样时间接续；
          主记录已有鉴定结果时补采只标待复核、结论不覆盖；主记录封存后补采申请退回，原链照旧。
          列表、阶段筛选、温度图与详情卡共用同一条链，浏览器重开后从本地存储恢复。
        </span>
      </header>

      <MetricStrip summary={summary} />

      <section className="workspace">
        <div className="left-col">
          <section className="panel">
            <h2>发育阶段筛选</h2>
            <StageFilterBar value={stageFilter} onChange={setStageFilter} counts={filterCounts} />
          </section>
          <RegistrationForm
            lock={lock}
            notice={notice}
            onSubmit={handleSubmit}
            onClearLock={() => setLock(null)}
          />
        </div>
        <ChainList
          chains={visibleChains}
          selectedId={selectedId}
          filterLabel={stageFilter}
          onSelect={setSelectedId}
          onLock={handleLock}
        />
      </section>

      <ChainDetail
        chain={selectedChain}
        onSaveResult={handleSaveResult}
        onReview={handleReview}
        onSeal={handleSeal}
        onLock={handleLock}
      />

      <ReturnedList returned={state.returned} onDismiss={handleDismissReturned} />

      <footer className="foot-note">
        纯前端实现：规则层（src/domain）、存储层（src/storage）、页面层（src/components）分离，无新增依赖与后端。
      </footer>
    </main>
  );
}
