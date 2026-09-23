// 存储层：只管 localStorage 的序列化、恢复与首次播种，不承载业务规则。
// 规则层产出的 RegistryState 原样落盘，浏览器重开后从这里恢复。

import { chainIdentity, timeKey } from "./../domain/rules";
import { RegistryState, ReturnedApplication, ReviewState, SampleChain, SampleDraft, Stage } from "./../domain/types";

const STORAGE_KEY = "forensic-chain-registry:v1";

export function emptyRegistry(): RegistryState {
  return { version: 1, chains: [], returned: [] };
}

// ---------- 播种：演示三种链状态 ----------

type SeedDraft = SampleDraft & { registeredAt: number };

const SEED_DEFAULTS = {
  exposureStage: "",
  preservation: "",
  note: "",
} as const;

function seedRecordInput(input: SeedDraft): SeedDraft {
  return { ...SEED_DEFAULTS, ...input };
}

function buildSeedChains(now: number): SampleChain[] {
  const day = new Date(now);
  const at = (offsetDays: number, hm: string): string => {
    const d = new Date(day);
    d.setDate(d.getDate() + offsetDays);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${hm}`;
  };

  const inputs: SeedDraft[] = [
    // 链一：主记录已有鉴定结果，两次补采（一待复核、一已复核）
    seedRecordInput({
      caseNo: "CASE-042",
      location: "室外草地",
      collectedAt: at(0, "09:10"),
      temperature: "24.2",
      exposureStage: "肿胀期",
      species: "丝光绿蝇",
      stage: "幼虫",
      preservation: "75%乙醇浸泡",
      note: "三龄幼虫，初步鉴定丝光绿蝇，与死亡时间推断吻合",
      registeredAt: now - 1000 * 60 * 60 * 26,
    }),
    seedRecordInput({
      caseNo: "CASE-042",
      location: "室外草地",
      collectedAt: at(0, "13:40"),
      temperature: "28.6",
      exposureStage: "肿胀期",
      species: "丝光绿蝇",
      stage: "幼虫",
      preservation: "75%乙醇浸泡",
      note: "三龄，体型偏大，建议复核龄期",
      registeredAt: now - 1000 * 60 * 60 * 22,
    }),
    seedRecordInput({
      caseNo: "CASE-042",
      location: "室外草地",
      collectedAt: at(0, "17:05"),
      temperature: "26.1",
      exposureStage: "腐烂期",
      species: "大头金蝇",
      stage: "幼虫",
      preservation: "活体饲养",
      note: "二龄幼虫，化蛹观察中",
      registeredAt: now - 1000 * 60 * 60 * 18,
    }),
    // 链二：主记录尚无鉴定结果，补采直接接续、不挂待复核
    seedRecordInput({
      caseNo: "CASE-051",
      location: "水沟边缘",
      collectedAt: at(-1, "08:30"),
      temperature: "19.8",
      exposureStage: "后腐烂期",
      species: "黑水虻",
      stage: "成虫",
      preservation: "针插标本",
      note: "",
      registeredAt: now - 1000 * 60 * 60 * 40,
    }),
    seedRecordInput({
      caseNo: "CASE-051",
      location: "水沟边缘",
      collectedAt: at(-1, "15:20"),
      temperature: "22.4",
      exposureStage: "后腐烂期",
      species: "黑水虻",
      stage: "卵",
      preservation: "低温冷藏",
      note: "卵块采集，待孵化",
      registeredAt: now - 1000 * 60 * 60 * 34,
    }),
    // 链三：已封存（配一条被退回的补采留痕）
    seedRecordInput({
      caseNo: "CASE-077",
      location: "阴影区域",
      collectedAt: at(-2, "10:00"),
      temperature: "21.6",
      exposureStage: "新鲜期",
      species: "家蝇",
      stage: "蛹",
      preservation: "干燥封存",
      note: "蛹壳标本，种属复核完成，鉴定意见书已签发",
      registeredAt: now - 1000 * 60 * 60 * 72,
    }),
    seedRecordInput({
      caseNo: "CASE-077",
      location: "阴影区域",
      collectedAt: at(-2, "16:45"),
      temperature: "20.9",
      exposureStage: "新鲜期",
      species: "家蝇",
      stage: "蛹",
      preservation: "干燥封存",
      note: "蛹期补采，封存前常规接续",
      registeredAt: now - 1000 * 60 * 60 * 66,
    }),
  ];

  const groups = new Map<string, SeedDraft[]>();
  for (const draft of inputs) {
    const id = chainIdentity(draft);
    const key = `${id.caseNo}|${id.location}|${id.date}`;
    groups.set(key, [...(groups.get(key) ?? []), draft]);
  }

  const chains: SampleChain[] = [];
  let chainSeq = 0;
  let recordSeq = 0;
  for (const [key, drafts] of groups) {
    chainSeq += 1;
    const ordered = drafts.slice().sort((a, b) => a.registeredAt - b.registeredAt);
    const first = ordered[0];
    const id0 = chainIdentity(first);
    const masterResult = first.note.trim().length > 0;
    const isSealed = key.startsWith("CASE-077|");

    const records = ordered.map((d, i) => {
      recordSeq += 1;
      let reviewState: ReviewState;
      if (i === 0) {
        reviewState = "none";
      } else if (isSealed) {
        reviewState = "reviewed"; // 封存前流程走完，补采已复核
      } else if (masterResult) {
        reviewState = i === ordered.length - 1 ? "pending" : "reviewed";
      } else {
        reviewState = "none";
      }
      return {
        id: `seed-rec-${recordSeq}`,
        role: i === 0 ? ("master" as const) : ("supplement" as const),
        caseNo: id0.caseNo,
        location: id0.location,
        collectedAt: d.collectedAt,
        temperature: d.temperature === "" ? null : Number(d.temperature),
        exposureStage: d.exposureStage,
        species: d.species,
        stage: d.stage as Stage,
        preservation: d.preservation,
        note: d.note,
        reviewState,
        registeredAt: d.registeredAt,
      };
    });

    chains.push({
      id: `seed-chain-${chainSeq}`,
      caseNo: id0.caseNo,
      location: id0.location,
      date: id0.date,
      sealed: isSealed,
      sealedAt: isSealed ? now - 1000 * 60 * 60 * 48 : null,
      createdAt: first.registeredAt,
      records,
    });
  }

  // 补采记录按采样时间接续
  return chains
    .map((c) => ({
      ...c,
      records: [
        c.records[0],
        ...c.records
          .slice(1)
          .sort((a, b) => timeKey(a.collectedAt) - timeKey(b.collectedAt)),
      ],
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function buildSeedReturned(now: number, chains: SampleChain[]): ReturnedApplication[] {
  const sealed = chains.find((c) => c.sealed);
  if (!sealed) return [];
  const rejectedAt = sealed.date.length === 10 ? `${sealed.date}T18:30` : sealed.date;
  return [
    {
      id: "seed-ret-1",
      caseNo: sealed.caseNo,
      location: sealed.location,
      date: sealed.date,
      collectedAt: rejectedAt,
      species: "家蝇",
      reason: "主记录已封存，补采申请退回，原链保持不变",
      returnedAt: now - 1000 * 60 * 60 * 46,
    },
  ];
}

export function seedRegistry(now: number = Date.now()): RegistryState {
  const chains = buildSeedChains(now);
  return { version: 1, chains, returned: buildSeedReturned(now, chains) };
}

// ---------- 持久化 ----------

/** 浏览器重开后恢复：数据损坏或缺版本时回退到播种数据，保证页面可读链 */
export function loadRegistry(): RegistryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedRegistry();
      saveRegistry(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as RegistryState;
    if (
      parsed &&
      parsed.version === 1 &&
      Array.isArray(parsed.chains) &&
      Array.isArray(parsed.returned)
    ) {
      return parsed;
    }
    return seedRegistry();
  } catch {
    return seedRegistry();
  }
}

export function saveRegistry(state: RegistryState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或配额超限时静默降级：本次会话仍可操作，只是不落盘
  }
}
