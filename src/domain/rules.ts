// 样本链规则层：全部为纯函数，不读 localStorage、不依赖 React。
// 规则要点：
// 1. 案件编号 + 采样地点 + 采集日 相同的记录收成一条样本链；
// 2. 首条登记记录为主记录（records[0]），后续补采按采样时间接续；
// 3. 主记录已有鉴定结果时，补采只标"待复核"，主记录结果不被覆盖；
// 4. 主记录封存后，补采申请退回，原链照旧（不进链、不改链，仅留痕）。

import {
  RegistryState,
  ReturnedApplication,
  SampleChain,
  SampleDraft,
  SampleRecord,
  Stage,
  STAGES,
} from "./types";

// ---------- 标识与校验 ----------

/** 链标识：案件编号 + 采样地点 + 采集日（YYYY-MM-DD） */
export function chainIdentity(d: { caseNo: string; location: string; collectedAt: string }): {
  caseNo: string;
  location: string;
  date: string;
} {
  return {
    caseNo: d.caseNo.trim(),
    location: d.location.trim(),
    date: (d.collectedAt || "").slice(0, 10),
  };
}

export interface DraftErrors {
  caseNo?: string;
  location?: string;
  collectedAt?: string;
  temperature?: string;
  species?: string;
  stage?: string;
}

export function validateDraft(d: SampleDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.caseNo.trim()) errors.caseNo = "请填写案件编号";
  if (!d.location.trim()) errors.location = "请填写采样地点";
  if (!d.collectedAt) errors.collectedAt = "请选择采样时间";
  if (d.temperature.trim() !== "") {
    const t = Number(d.temperature);
    if (!Number.isFinite(t) || t < -30 || t > 60) {
      errors.temperature = "温度需在 -30 ~ 60 ℃ 之间";
    }
  }
  if (!d.species.trim()) errors.species = "请填写昆虫种类";
  if (!STAGES.includes(d.stage as Stage)) errors.stage = "请选择发育阶段";
  return errors;
}

// ---------- 小工具 ----------

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function newRecordId(): string {
  return uid("rec");
}
function newChainId(): string {
  return uid("chain");
}
function newApplicationId(): string {
  return uid("ret");
}

/** 采样时间转可比较的毫秒数；缺省时回退到 0，保持稳定顺序 */
export function timeKey(collectedAt: string): number {
  const t = Date.parse(collectedAt.replace(" ", "T"));
  return Number.isNaN(t) ? 0 : t;
}

export function masterOf(chain: SampleChain): SampleRecord {
  return chain.records[0];
}

/** 主记录"已有鉴定结果"：鉴定备注非空即视为有结论 */
export function masterHasResult(chain: SampleChain): boolean {
  return chain.records.length > 0 && masterOf(chain).note.trim().length > 0;
}

export function chainLatestAt(chain: SampleChain): number {
  return chain.records.reduce((max, r) => Math.max(max, timeKey(r.collectedAt)), timeKey(chain.date));
}

// ---------- 记录构造 ----------

function buildRecord(
  draft: SampleDraft,
  role: SampleRecord["role"],
  reviewState: SampleRecord["reviewState"],
  registeredAt: number,
): SampleRecord {
  const t = draft.temperature.trim() === "" ? null : Number(draft.temperature);
  return {
    id: newRecordId(),
    role,
    caseNo: draft.caseNo.trim(),
    location: draft.location.trim(),
    collectedAt: draft.collectedAt,
    temperature: Number.isFinite(t as number) ? t : null,
    exposureStage: draft.exposureStage,
    species: draft.species.trim(),
    stage: draft.stage as Stage,
    preservation: draft.preservation,
    note: draft.note.trim(),
    reviewState,
    registeredAt,
  };
}

/** 把一条补采记录插入链中：主记录始终居首，其余按采样时间接续 */
function appendSupplement(chain: SampleChain, record: SampleRecord): SampleChain {
  return {
    ...chain,
    records: [
      chain.records[0],
      ...chain.records.slice(1).concat(record).sort((a, b) => {
        const byTime = timeKey(a.collectedAt) - timeKey(b.collectedAt);
        return byTime !== 0 ? byTime : a.registeredAt - b.registeredAt;
      }),
    ],
  };
}

// ---------- 核心规则：登记 / 补采申请 ----------

export interface SubmitOutcome {
  state: RegistryState;
  kind: "created" | "attached" | "pending-review" | "returned";
  message: string;
  chainId?: string;
}

export function submitApplication(prev: RegistryState, draft: SampleDraft, now: number = Date.now()): SubmitOutcome {
  const { caseNo, location, date } = chainIdentity(draft);
  const index = prev.chains.findIndex(
    (c) => c.caseNo === caseNo && c.location === location && c.date === date,
  );

  // 规则 1 前半：同键不存在 → 首条登记，作为主记录建新链
  if (index === -1) {
    const master = buildRecord(draft, "master", "none", now);
    const chain: SampleChain = {
      id: newChainId(),
      caseNo,
      location,
      date,
      sealed: false,
      sealedAt: null,
      createdAt: now,
      records: [master],
    };
    return {
      state: { ...prev, chains: [...prev.chains, chain] },
      kind: "created",
      message: `已建立样本链，${caseNo} 首条记录作为主登记`,
      chainId: chain.id,
    };
  }

  const chain = prev.chains[index];

  // 规则 4：主记录封存后，补采申请退回，原链照旧
  if (chain.sealed) {
    const returned: ReturnedApplication = {
      id: newApplicationId(),
      caseNo,
      location,
      date,
      collectedAt: draft.collectedAt,
      species: draft.species.trim(),
      reason: `主记录已封存（${formatClock(chain.sealedAt ?? now)}），补采申请退回，原链保持不变`,
      returnedAt: now,
    };
    return {
      state: { ...prev, returned: [returned, ...prev.returned] },
      kind: "returned",
      message: "补采申请已退回：该样本链主记录已封存，原链未改动",
    };
  }

  // 规则 3：主记录已有鉴定结果 → 补采只标待复核，结果不覆盖
  const reviewState: SampleRecord["reviewState"] = masterHasResult(chain) ? "pending" : "none";
  const record = buildRecord(draft, "supplement", reviewState, now);
  const updated = appendSupplement(chain, record);
  const chains = prev.chains.slice();
  chains[index] = updated;

  return {
    state: { ...prev, chains },
    kind: reviewState === "pending" ? "pending-review" : "attached",
    message:
      reviewState === "pending"
        ? "补采已按采样时间接入样本链，主记录已有鉴定结果，本补采标记为待复核"
        : "补采已按采样时间接入样本链",
    chainId: chain.id,
  };
}

// ---------- 主记录鉴定结果、补采复核、封存 ----------

/** 录入主记录鉴定结果；补采若尚未复核则一并转入待复核（主记录结果本身不被补采改写） */
export function recordMasterResult(prev: RegistryState, chainId: string, note: string): RegistryState {
  return {
    ...prev,
    chains: prev.chains.map((chain) => {
      if (chain.id !== chainId || chain.sealed) return chain;
      const records = chain.records.map((r, i) =>
        i === 0
          ? { ...r, note: note.trim() }
          : { ...r, reviewState: r.reviewState === "none" ? "pending" : r.reviewState },
      );
      return { ...chain, records };
    }),
  };
}

/** 复核补采：只改补采自身状态，主记录鉴定结果不动 */
export function reviewSupplement(
  prev: RegistryState,
  chainId: string,
  recordId: string,
  verdict: "reviewed" | "pending",
): RegistryState {
  return {
    ...prev,
    chains: prev.chains.map((chain) => {
      if (chain.id !== chainId || chain.sealed) return chain;
      return {
        ...chain,
        records: chain.records.map((r) =>
          r.id === recordId && r.role === "supplement" ? { ...r, reviewState: verdict } : r,
        ),
      };
    }),
  };
}

/** 封存主记录：封存不可逆，之后的补采申请一律退回 */
export function sealChain(prev: RegistryState, chainId: string, now: number = Date.now()): RegistryState {
  return {
    ...prev,
    chains: prev.chains.map((chain) =>
      chain.id === chainId && !chain.sealed ? { ...chain, sealed: true, sealedAt: now } : chain,
    ),
  };
}

/** 清理退回留痕（仅删留痕，链数据不受影响） */
export function dismissReturned(prev: RegistryState, returnedId: string): RegistryState {
  return { ...prev, returned: prev.returned.filter((r) => r.id !== returnedId) };
}

// ---------- 查询 ----------

/** 阶段筛选：链内任一记录（含补采）处于该发育阶段即命中 */
export function chainMatchesStage(chain: SampleChain, stage: Stage | "全部"): boolean {
  return stage === "全部" || chain.records.some((r) => r.stage === stage);
}

export interface RegistrySummary {
  chainCount: number;
  recordCount: number;
  pendingReview: number;
  returnedCount: number;
  avgTemperature: number | null;
}

export function summarize(state: RegistryState): RegistrySummary {
  const temps = state.chains.flatMap((c) =>
    c.records.map((r) => r.temperature).filter((t): t is number => t !== null),
  );
  return {
    chainCount: state.chains.length,
    recordCount: state.chains.reduce((n, c) => n + c.records.length, 0),
    pendingReview: state.chains.reduce(
      (n, c) => n + c.records.filter((r) => r.reviewState === "pending").length,
      0,
    ),
    returnedCount: state.returned.length,
    avgTemperature: temps.length
      ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10
      : null,
  };
}

/** 案件关联视图：按案件编号归集其全部样本链 */
export function groupByCases(chains: SampleChain[]): { caseNo: string; chains: SampleChain[] }[] {
  const map = new Map<string, SampleChain[]>();
  for (const chain of chains) {
    const list = map.get(chain.caseNo) ?? [];
    list.push(chain);
    map.set(chain.caseNo, list);
  }
  return Array.from(map, ([caseNo, list]) => ({
    caseNo,
    chains: list
      .slice()
      .sort((a, b) => timeKey(a.date) - timeKey(b.date) || a.createdAt - b.createdAt),
  })).sort((a, b) => a.caseNo.localeCompare(b.caseNo, "zh-CN"));
}

export function sortChains(chains: SampleChain[]): SampleChain[] {
  return chains
    .slice()
    .sort((a, b) => chainLatestAt(b) - chainLatestAt(a) || b.createdAt - a.createdAt);
}

// ---------- 展示用格式化 ----------

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}

export function formatCollectedAt(value: string): string {
  return value.replace("T", " ");
}
