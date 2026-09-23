// 存储层：负责 localStorage 读写、数据版本/校验与订阅通知。
// 不包含任何业务判定（收链、退回、封存等规则全部来自 rules 层），页面层只通过本模块读写。

import {
  DATA_VERSION,
  type ChainStoreData,
  type RejectedApplication,
  type SampleRecord,
  type Stage,
  submitSample,
  setMasterIdentification,
  sealChain,
} from "../rules/chainRules";

const STORAGE_KEY = "forensic-sample-chains:v1";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dayIso(day: string, hour: number, minute = 0): string {
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`)
    .toISOString();
}

// 内置演示数据：通过规则层的 submitSample 逐条折叠产生，
// 因此“收链 / 待复核 / 封存退回”的结果都由真实规则推导。
function buildSeed(): ChainStoreData {
  let data: ChainStoreData = { version: DATA_VERSION, records: [], rejections: [], sealedMasterIds: [] };
  const at = (n: number) => new Date(2026, 8, 18, 8, n).toISOString(); // 2026-09-18
  let seq = 0;
  const id = () => `seed-${++seq}`;

  const base = {
    caseNo: "",
    location: "",
    collectedAt: "",
    temperature: 0,
    exposureStage: "",
    species: "",
    stage: "幼虫" as Stage,
    preserve: "乙醇保存",
    note: "",
    identification: "",
  };

  const step = (input: Parameters<typeof submitSample>[0]) => {
    const result = submitSample(input, {
      records: data.records,
      sealedMasterIds: data.sealedMasterIds,
      createId: id,
      now: () => at(seq),
    });
    if (result.type === "rejected" && result.rejection) {
      data = { ...data, rejections: [...data.rejections, result.rejection] };
    } else if (result.record) {
      data = { ...data, records: [...data.records, result.record] };
    }
  };

  // CASE-042 · 室外草地 · 09-18：主记录（已有鉴定结果）+ 补采（自动待复核）
  step({
    ...base,
    caseNo: "CASE-042",
    location: "室外草地",
    collectedAt: dayIso("2026-09-18", 9, 10),
    temperature: 24.2,
    exposureStage: "肿胀期",
    species: "丝光绿蝇",
    stage: "幼虫",
    note: "草皮下土壤表层采集",
    identification: "丝光绿蝇三龄幼虫，PMI 约 36 小时",
  });
  step({
    ...base,
    caseNo: "CASE-042",
    location: "室外草地",
    collectedAt: dayIso("2026-09-18", 14, 30),
    temperature: 28.6,
    exposureStage: "肿胀期",
    species: "丝光绿蝇",
    stage: "幼虫",
    note: "同一批补采，午后高温时段",
    identification: "补采卡自行填写的结论不会覆盖主记录",
  });

  // CASE-042 · 阴影区域 · 09-18：另一条链（采样地点不同，不收链）
  step({
    ...base,
    caseNo: "CASE-042",
    location: "阴影区域",
    collectedAt: dayIso("2026-09-18", 10, 0),
    temperature: 21.8,
    exposureStage: "肿胀期",
    species: "红头丽蝇",
    stage: "蛹",
    note: "树荫下蛹期样本",
    identification: "",
  });

  // CASE-051 · 水沟边缘 · 09-19：主记录随后封存，再提交的补采被退回
  step({
    ...base,
    caseNo: "CASE-051",
    location: "水沟边缘",
    collectedAt: dayIso("2026-09-19", 8, 20),
    temperature: 19.4,
    exposureStage: "新鲜期",
    species: "大隐翅虫",
    stage: "成虫",
    note: "潮泥表面成虫采集，已拍照",
    identification: "大隐翅虫成虫",
  });
  return data;
}

function sealSeededChains(data: ChainStoreData): ChainStoreData {
  // 演示：封存 CASE-051 · 水沟边缘 这条链
  let next = sealChain(data, "case-051§水沟边缘§2026-09-19");

  // 封存后再补采：走规则层正常登记入口，结果必然是“申请退回、原链照旧”
  let seq = 100;
  const rejected = submitSample(
    {
      caseNo: "CASE-051",
      location: "水沟边缘",
      collectedAt: dayIso("2026-09-19", 16, 10),
      temperature: 22.7,
      exposureStage: "新鲜期",
      species: "大隐翅虫",
      stage: "成虫",
      preserve: "乙醇保存",
      note: "封存后的补采申请（演示退回）",
      identification: "",
    },
    {
      records: next.records,
      sealedMasterIds: next.sealedMasterIds,
      createId: () => `seed-rej-${++seq}`,
      now: () => new Date(2026, 8, 19, 9, 0).toISOString(),
    },
  );
  if (rejected.type === "rejected" && rejected.rejection) {
    next = { ...next, rejections: [...next.rejections, rejected.rejection] };
  }
  return next;
}

function isValidStage(value: unknown): value is SampleRecord["stage"] {
  return value === "卵" || value === "幼虫" || value === "蛹" || value === "成虫";
}

function sanitize(raw: unknown): ChainStoreData | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<ChainStoreData>;
  if (!Array.isArray(candidate.records) || !Array.isArray(candidate.rejections)) return null;
  const records: SampleRecord[] = [];
  for (const item of candidate.records) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<SampleRecord>;
    if (
      typeof r.id !== "string" ||
      typeof r.caseNo !== "string" ||
      typeof r.location !== "string" ||
      typeof r.collectedAt !== "string" ||
      typeof r.createdAt !== "string" ||
      typeof r.temperature !== "number" ||
      !isValidStage(r.stage)
    ) {
      continue;
    }
    records.push({
      id: r.id,
      caseNo: r.caseNo,
      location: r.location,
      collectedAt: r.collectedAt,
      createdAt: r.createdAt,
      temperature: r.temperature,
      exposureStage: typeof r.exposureStage === "string" ? r.exposureStage : "",
      species: typeof r.species === "string" ? r.species : "",
      stage: r.stage,
      preserve: typeof r.preserve === "string" ? r.preserve : "",
      note: typeof r.note === "string" ? r.note : "",
      identification: typeof r.identification === "string" ? r.identification : "",
      master: Boolean(r.master),
      supplementStatus:
        r.supplementStatus === "待复核" || r.supplementStatus === "已复核"
          ? r.supplementStatus
          : undefined,
    });
  }
  const rejections: RejectedApplication[] = candidate.rejections
    .filter(
      (item): item is RejectedApplication =>
        Boolean(item && typeof item === "object" && (item as RejectedApplication).id),
    )
    .map((item) => ({ ...item }));
  return {
    version: DATA_VERSION,
    records,
    rejections,
    sealedMasterIds: Array.isArray(candidate.sealedMasterIds)
      ? candidate.sealedMasterIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function initialData(): ChainStoreData {
  if (typeof localStorage === "undefined") return sealSeededChains(buildSeed());
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = sanitize(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    // 存储损坏时回落到内置演示数据
  }
  const seed = sealSeededChains(buildSeed());
  persist(seed);
  return seed;
}

function persist(data: ChainStoreData): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式/配额受限时只读运行
  }
}

// --- 极简外部 store：useSyncExternalStore 订阅，刷新/重开浏览器后从 localStorage 恢复 ---

let state: ChainStoreData = initialData();
const listeners = new Set<() => void>();

function commit(next: ChainStoreData): void {
  if (next === state) return;
  state = next;
  persist(state);
  listeners.forEach((listener) => listener());
}

export const chainStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState(): ChainStoreData {
    return state;
  },
  register(input: Parameters<typeof submitSample>[0]) {
    const result = submitSample(input, {
      records: state.records,
      sealedMasterIds: state.sealedMasterIds,
      createId: makeId,
      now: () => new Date().toISOString(),
    });
    if (result.type === "rejected" && result.rejection) {
      commit({ ...state, rejections: [...state.rejections, result.rejection] });
    } else if (result.record) {
      commit({ ...state, records: [...state.records, result.record] });
    }
    return result;
  },
  saveIdentification(chainId: string, identification: string) {
    commit(setMasterIdentification(state, chainId, identification));
  },
  seal(chainId: string) {
    commit(sealChain(state, chainId));
  },
  resetDemo() {
    commit(sealSeededChains(buildSeed()));
  },
  clearAll() {
    commit({ version: DATA_VERSION, records: [], rejections: [], sealedMasterIds: [] });
  },
};
