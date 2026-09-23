import {
  chainMatchesStage,
  masterHasResult,
  masterOf,
  recordMasterResult,
  reviewSupplement,
  sealChain,
  submitApplication,
  summarize,
} from "../src/domain/rules";
import { emptyRegistry } from "../src/storage/storage";
import { SampleDraft, Stage } from "../src/domain/types";

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`✗ ${name} ${detail}`);
  }
}

const baseDraft = (over: Partial<SampleDraft>): SampleDraft => ({
  caseNo: "CASE-100",
  location: "室外草地",
  collectedAt: "2026-09-23T09:00",
  temperature: "25.0",
  exposureStage: "肿胀期",
  species: "丝光绿蝇",
  stage: "幼虫" as Stage,
  preservation: "75%乙醇浸泡",
  note: "",
  ...over,
});

// 1. 首条登记建链，作为主记录
let s = emptyRegistry();
let o = submitApplication(s, baseDraft({ registeredAt: 0 } as never), 1000);
s = o.state;
assert("首条登记 kind=created", o.kind === "created");
assert("只有一条链", s.chains.length === 1);
assert("首条记录是主记录", masterOf(s.chains[0]).role === "master");

// 2. 同案同地同日 → 收成同一链；补采按采样时间接续
o = submitApplication(s, baseDraft({ collectedAt: "2026-09-23T14:00", temperature: "28.0" }), 2000);
s = o.state;
assert("同键补采 kind=attached", o.kind === "attached");
assert("链数仍为 1", s.chains.length === 1);
assert("链上有 2 条记录", s.chains[0].records.length === 2);
assert("主记录仍居首", masterOf(s.chains[0]).collectedAt === "2026-09-23T09:00");

// 更晚登记但更早采样的补采，应插到主记录之后、按采样时间排序
o = submitApplication(s, baseDraft({ collectedAt: "2026-09-23T11:00", temperature: "26.0" }), 3000);
s = o.state;
assert("补采按采样时间接续", s.chains[0].records.map((r) => r.collectedAt.slice(11)).join(",") === "09:00,11:00,14:00");

// 3. 不同地点 → 另起一条链
o = submitApplication(s, baseDraft({ location: "水沟边缘" }), 4000);
s = o.state;
assert("不同地点另起链", s.chains.length === 2);

// 不同采集日 → 另起一条链
o = submitApplication(s, baseDraft({ collectedAt: "2026-09-24T09:00" }), 5000);
s = o.state;
assert("不同采集日另起链", s.chains.length === 3);

// 4. 主记录无结论时，补采不挂待复核
const chainId = s.chains.find((c) => c.records.length === 3)!.id;
assert("主记录无鉴定结果", !masterHasResult(s.chains.find((c) => c.id === chainId)!));
assert("无结论时补采 reviewState=none", s.chains.find((c) => c.id === chainId)!.records.slice(1).every((r) => r.reviewState === "none"));

// 5. 录入主记录结论后，新补采只标待复核；已有补采转为待复核；结论不被补采备注覆盖
s = recordMasterResult(s, chainId, "确认为丝光绿蝇三龄幼虫");
assert("主记录已有结论", masterHasResult(s.chains.find((c) => c.id === chainId)!));
assert("在链补采转为待复核", s.chains.find((c) => c.id === chainId)!.records.slice(1).every((r) => r.reviewState === "pending"));
o = submitApplication(s, baseDraft({ collectedAt: "2026-09-23T18:00", note: "有人误写成别的种属结论" }), 6000);
s = o.state;
assert("有结论后新补采 kind=pending-review", o.kind === "pending-review");
const chain = s.chains.find((c) => c.id === chainId)!;
assert("主记录结论未被覆盖", masterOf(chain).note === "确认为丝光绿蝇三龄幼虫");
const newSupp = chain.records.find((r) => r.collectedAt === "2026-09-23T18:00")!;
assert("新补采标记待复核", newSupp.reviewState === "pending");

// 6. 复核只改补采自身
s = reviewSupplement(s, chainId, newSupp.id, "reviewed");
assert("补采可复核通过", s.chains.find((c) => c.id === chainId)!.records.find((r) => r.id === newSupp.id)!.reviewState === "reviewed");
assert("复核不动主记录结论", masterOf(s.chains.find((c) => c.id === chainId)!).note === "确认为丝光绿蝇三龄幼虫");

// 7. 封存后补采退回，原链照旧
s = sealChain(s, chainId, 7000);
const sealedChainSnapshot = JSON.stringify(s.chains.find((c) => c.id === chainId));
const returnedCountBefore = s.returned.length;
o = submitApplication(s, baseDraft({ collectedAt: "2026-09-23T20:00" }), 8000);
assert("封存后 kind=returned", o.kind === "returned");
assert("退回不留链数据", o.state.chains.length === s.chains.length);
assert("退回产生留痕", o.state.returned.length === returnedCountBefore + 1);
assert("原链照旧（封存后内容未变）", JSON.stringify(o.state.chains.find((c) => c.id === chainId)) === sealedChainSnapshot);
s = o.state;

// 8. 封存链不能再录结论 / 复核（函数直接跳过）
const s2 = recordMasterResult(s, chainId, "试图篡改结论");
assert("封存后结论不可改", masterOf(s2.chains.find((c) => c.id === chainId)!).note === "确认为丝光绿蝇三龄幼虫");

// 9. 阶段筛选：链内任一记录命中即显示
assert("阶段筛选-幼虫命中", chainMatchesStage(chain, "幼虫"));
assert("阶段筛选-卵不命中", !chainMatchesStage(chain, "卵"));
assert("阶段筛选-全部命中", chainMatchesStage(chain, "全部"));

// 10. 汇总
const sum = summarize(s);
assert("汇总待复核数不为负/合理", sum.pendingReview >= 0 && sum.chainCount === 3);
assert("平均温度为数值", sum.avgTemperature !== null && sum.avgTemperature! > 0);

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
