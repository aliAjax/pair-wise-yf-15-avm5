// 样本链业务规则层（纯函数）：
// 同一「案件编号 + 采样地点 + 采集日」的登记卡收为一条样本链，
// 首条登记卡作为主记录；主记录已有鉴定结果时，补采只标“待复核”，
// 主记录封存后，补采申请直接退回，原链不变。
// 本文件不接触存储与 DOM，便于单独验证。

export type Stage = "卵" | "幼虫" | "蛹" | "成虫";
export const STAGES: Stage[] = ["卵", "幼虫", "蛹", "成虫"];

export const EXPOSURE_STAGES = ["新鲜期", "肿胀期", "腐烂期", "后腐烂期", "白骨化期"];
export const PRESERVE_METHODS = ["低温冷藏", "乙醇保存", "干燥保存", "活体饲养"];

export type ReviewStatus = "待复核" | "已复核";

export interface SampleInput {
  caseNo: string;
  location: string;
  collectedAt: string; // ISO 时间（决定链上的先后顺序）
  temperature: number; // ℃
  exposureStage: string;
  species: string;
  stage: Stage;
  preserve: string;
  note: string;
  identification?: string; // 鉴定备注/结果
}

export interface SampleRecord extends SampleInput {
  id: string;
  createdAt: string; // 登记时间
  master: boolean;
  supplementStatus?: ReviewStatus; // 仅补采卡有值
}

export interface RejectedApplication {
  id: string;
  reason: string;
  input: SampleInput;
  rejectedAt: string;
}

export interface SampleChain {
  id: string;
  caseNo: string;
  location: string;
  collectedDay: string; // YYYY-MM-DD
  master: SampleRecord;
  supplements: SampleRecord[]; // 按采集时间先后
  members: SampleRecord[]; // 完整时序，首条即主记录
  state: ChainState;
}

export type ChainState = "开放" | "已封存";

export interface SubmitOutcome {
  type: "master-created" | "supplement-accepted" | "rejected";
  chainId?: string;
  record?: SampleRecord;
  rejection?: RejectedApplication;
  message: string;
}

export interface ChainStoreData {
  version: number;
  records: SampleRecord[];
  rejections: RejectedApplication[];
  sealedMasterIds: string[];
}

export const DATA_VERSION = 1;

const pad = (n: number) => String(n).padStart(2, "0");

export function toDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

// 链键：案件编号 + 采样地点 + 采集日，均做去空白归一化
export function chainKey(caseNo: string, location: string, collectedDay: string): string {
  return [caseNo.trim(), location.trim(), collectedDay.trim()].map(normalizeText).join("§");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

// 主记录由「链上最早采集时间」决定；采集时间相同则以最早登记时间为准。
export function buildChains(
  records: SampleRecord[],
  sealedMasterIds: string[] = [],
): SampleChain[] {
  const groups = new Map<string, SampleRecord[]>();
  for (const record of records) {
    const key = chainKey(record.caseNo, record.location, toDay(record.collectedAt));
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }

  const chains: SampleChain[] = [];
  for (const [key, list] of groups) {
    const ordered = [...list].sort((a, b) => {
      const byCollected = new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime();
      if (byCollected !== 0) return byCollected;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const masterRecord = ordered[0];
    const masterId = masterRecord.id;
    const members = ordered.map((record) => ({
      ...record,
      master: record.id === masterId,
    }));
    chains.push({
      id: key,
      caseNo: masterRecord.caseNo.trim(),
      location: masterRecord.location.trim(),
      collectedDay: toDay(masterRecord.collectedAt),
      master: members[0],
      supplements: members.slice(1),
      members,
      state: sealedMasterIds.includes(masterId) ? "已封存" : "开放",
    });
  }

  return chains.sort((a, b) => b.master.createdAt.localeCompare(a.master.createdAt));
}

export function validateInput(input: SampleInput): string | null {
  if (!input.caseNo.trim()) return "请填写案件编号";
  if (!input.location.trim()) return "请填写采样地点";
  if (!input.collectedAt || Number.isNaN(new Date(input.collectedAt).getTime()))
    return "请选择有效的采集时间";
  if (!input.species.trim()) return "请填写昆虫种类";
  if (!Number.isFinite(input.temperature)) return "请填写环境温度";
  return null;
}

interface SubmitContext {
  records: SampleRecord[];
  sealedMasterIds: string[];
  createId: () => string;
  now: () => string;
}

// 登记规则入口：自动判断新主记录 / 补采 / 退回。
export function submitSample(
  raw: SampleInput,
  ctx: SubmitContext,
): SubmitOutcome {
  const error = validateInput(raw);
  if (error) return { type: "rejected", message: error };

  const input: SampleInput = {
    ...raw,
    caseNo: raw.caseNo.trim(),
    location: raw.location.trim(),
    species: raw.species.trim(),
    note: raw.note.trim(),
    identification: raw.identification?.trim() || "",
  };

  const chains = buildChains(ctx.records, ctx.sealedMasterIds);
  const day = toDay(input.collectedAt);
  const key = chainKey(input.caseNo, input.location, day);
  const existing = chains.find((chain) => chain.id === key);

  if (!existing) {
    const record: SampleRecord = {
      ...input,
      id: ctx.createId(),
      createdAt: ctx.now(),
      master: true,
    };
    return {
      type: "master-created",
      chainId: key,
      record,
      message: `已建立新样本链「${input.caseNo} · ${day}」，本卡为主记录。`,
    };
  }

  if (existing.state === "已封存") {
    const rejection: RejectedApplication = {
      id: ctx.createId(),
      reason: `主记录（${formatTime(existing.master.collectedAt)} 采集）已封存，补采申请退回，原链照旧。`,
      input,
      rejectedAt: ctx.now(),
    };
    return {
      type: "rejected",
      chainId: existing.id,
      rejection,
      message: rejection.reason,
    };
  }

  // 主记录已有鉴定结果：补采不再写入鉴定结果，仅标记待复核。
  const alreadyIdentified = existing.master.identification.trim().length > 0;
  const record: SampleRecord = {
    ...input,
    // 鉴定结果一律以主记录为准，补采不覆盖
    identification: alreadyIdentified ? "" : input.identification,
    id: ctx.createId(),
    createdAt: ctx.now(),
    master: false,
    supplementStatus: alreadyIdentified ? "待复核" : undefined,
  };

  return {
    type: "supplement-accepted",
    chainId: existing.id,
    record,
    message: alreadyIdentified
      ? `已并入样本链（${existing.members.length + 1} 张卡）。主记录已有鉴定结果，本补采标记为待复核，原结果不覆盖。`
      : `已作为补采接入样本链（${existing.members.length + 1} 张卡），按采集时间排列。`,
  };
}

// 仅主记录可写入鉴定结果；封存后只读。
export function setMasterIdentification(
  data: ChainStoreData,
  chainId: string,
  identification: string,
): ChainStoreData {
  const chains = buildChains(data.records, data.sealedMasterIds);
  const chain = chains.find((item) => item.id === chainId);
  if (!chain || chain.state === "已封存") return data;

  const masterId = chain.master.id;
  const value = identification.trim();
  const records = data.records.map((record) => {
    if (record.id === masterId) return { ...record, identification: value };
    // 主记录首次出现鉴定结果后，链上补采统一进入待复核（不改动主记录已有结果）
    if (!record.master && chain.master.identification.trim() === "" && value) {
      return { ...record, supplementStatus: "待复核" as ReviewStatus, identification: "" };
    }
    return record;
  });
  return { ...data, records };
}

// 封存主记录：封存后新补采申请将被退回。
export function sealChain(data: ChainStoreData, chainId: string): ChainStoreData {
  const chains = buildChains(data.records, data.sealedMasterIds);
  const chain = chains.find((item) => item.id === chainId);
  if (!chain || chain.state === "已封存") return data;
  return { ...data, sealedMasterIds: [...data.sealedMasterIds, chain.master.id] };
}

export function chainsByCase(chains: SampleChain[]): { caseNo: string; chains: SampleChain[] }[] {
  const map = new Map<string, SampleChain[]>();
  for (const chain of chains) {
    const list = map.get(chain.caseNo);
    if (list) list.push(chain);
    else map.set(chain.caseNo, [chain]);
  }
  return [...map.entries()]
    .map(([caseNo, caseChains]) => ({ caseNo, chains: caseChains }))
    .sort((a, b) => a.caseNo.localeCompare(b.caseNo));
}

export function chainsByStage(chains: SampleChain[], stage: Stage | "全部"): SampleChain[] {
  if (stage === "全部") return chains;
  return chains.filter((chain) => chain.members.some((member) => member.stage === stage));
}

export interface TemperaturePoint {
  recordId: string;
  chainId: string;
  time: number;
  temperature: number;
  label: string;
}

// 温度图读链：每张登记卡（含补采）都是一个温度观测点。
export function temperatureSeries(chains: SampleChain[]): Map<string, TemperaturePoint[]> {
  const series = new Map<string, TemperaturePoint[]>();
  for (const chain of chains) {
    const points = chain.members
      .map((member) => ({
        recordId: member.id,
        chainId: chain.id,
        time: new Date(member.collectedAt).getTime(),
        temperature: member.temperature,
        label: `${member.species} · ${member.stage}`,
      }))
      .sort((a, b) => a.time - b.time);
    series.set(chain.id, points);
  }
  return series;
}

export interface BoardMetrics {
  chainCount: number;
  cardCount: number;
  avgTemperature: number;
  pendingReview: number;
  rejectedCount: number;
  sealedCount: number;
}

export function boardMetrics(data: ChainStoreData): BoardMetrics {
  const chains = buildChains(data.records, data.sealedMasterIds);
  const cardCount = data.records.length;
  const avg =
    cardCount === 0
      ? 0
      : data.records.reduce((sum, record) => sum + record.temperature, 0) / cardCount;
  const pendingReview = data.records.filter(
    (record) => !record.master && record.supplementStatus === "待复核",
  ).length;
  return {
    chainCount: chains.length,
    cardCount,
    avgTemperature: avg,
    pendingReview,
    rejectedCount: data.rejections.length,
    sealedCount: chains.filter((chain) => chain.state === "已封存").length,
  };
}
