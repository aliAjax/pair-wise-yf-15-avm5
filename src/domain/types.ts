// 领域模型：法医昆虫学样本链
// 规则层只依赖类型，不接触 localStorage 与 React。

export const STAGES = ["卵", "幼虫", "蛹", "成虫"] as const;
export type Stage = (typeof STAGES)[number];

export const EXPOSURE_STAGES = [
  "新鲜期",
  "肿胀期",
  "腐烂期",
  "后腐烂期",
  "白骨化期",
] as const;

export const PRESERVATIONS = [
  "75%乙醇浸泡",
  "针插标本",
  "干燥封存",
  "低温冷藏",
  "活体饲养",
] as const;

/** 登记台提交上来的原始表单 */
export interface SampleDraft {
  caseNo: string; // 案件编号
  location: string; // 采样地点
  collectedAt: string; // 采样时间（含采集日），datetime-local 格式 YYYY-MM-DDTHH:mm
  temperature: string; // 环境温度（℃），字符串由规则层校验转换
  exposureStage: string; // 尸体暴露阶段
  species: string; // 昆虫种类
  stage: Stage | ""; // 发育阶段
  preservation: string; // 保存方式
  note: string; // 鉴定备注 / 鉴定结果
}

/** 补采复核状态：主记录不受补采影响，补采只标待复核 */
export type ReviewState = "none" | "pending" | "reviewed";

/** 链上的一条记录（主记录或补采记录） */
export interface SampleRecord {
  id: string;
  role: "master" | "supplement";
  caseNo: string;
  location: string;
  collectedAt: string;
  temperature: number | null;
  exposureStage: string;
  species: string;
  stage: Stage;
  preservation: string;
  note: string;
  reviewState: ReviewState;
  /** 登记申请时间，决定谁是首条主记录 */
  registeredAt: number;
}

/**
 * 样本链：案件编号 + 采样地点 + 采集日相同的记录收成一条链。
 * records[0] 永远是首条登记的主记录，其余补采按采样时间接续。
 */
export interface SampleChain {
  id: string;
  caseNo: string;
  location: string;
  date: string; // 采集日 YYYY-MM-DD
  sealed: boolean; // 主记录封存后，新补采申请一律退回
  sealedAt: number | null;
  createdAt: number;
  records: SampleRecord[];
}

/** 封存链被退回的补采申请（留痕，不进链、不改链） */
export interface ReturnedApplication {
  id: string;
  caseNo: string;
  location: string;
  date: string;
  collectedAt: string;
  species: string;
  reason: string;
  returnedAt: number;
}

export interface RegistryState {
  version: 1;
  chains: SampleChain[];
  returned: ReturnedApplication[];
}
