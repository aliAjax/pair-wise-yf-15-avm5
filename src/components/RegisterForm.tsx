import { useMemo, useState } from "react";
import { chainStore } from "../storage/chainStore";
import {
  buildChains,
  chainKey,
  EXPOSURE_STAGES,
  PRESERVE_METHODS,
  STAGES,
  toDay,
  type Stage,
  type SubmitOutcome,
} from "../rules/chainRules";
import { useChainStore } from "../hooks/useChainStore";

// 把 datetime-local 值（本地时间，不带时区）转成 ISO。
function localInputToIso(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const blank = () => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return {
    caseNo: "",
    location: "",
    collectedAt: isoToLocalInput(now.toISOString()),
    temperature: "24",
    exposureStage: EXPOSURE_STAGES[0],
    species: "",
    stage: "幼虫" as Stage,
    preserve: PRESERVE_METHODS[1],
    note: "",
    identification: "",
  };
};

export default function RegisterForm() {
  const data = useChainStore();
  const [form, setForm] = useState(blank);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);

  // 录入时即时提示：这张卡会成为新主记录、补采，还是会被退回。
  const preview = useMemo(() => {
    const iso = localInputToIso(form.collectedAt);
    if (!form.caseNo.trim() || !form.location.trim() || !iso) return null;
    const chains = buildChains(data.records, data.sealedMasterIds);
    const key = chainKey(form.caseNo, form.location, toDay(iso));
    const existing = chains.find((chain) => chain.id === key);
    if (!existing) return { kind: "new" as const, text: "将建立新样本链，本卡为主记录" };
    if (existing.state === "已封存")
      return {
        kind: "reject" as const,
        text: `该链主记录已封存：提交后补采申请将退回，原链照旧（当前链 ${existing.members.length} 张卡）`,
      };
    if (existing.master.identification.trim())
      return {
        kind: "review" as const,
        text: `将接入现有链（第 ${existing.members.length + 1} 张卡）：主记录已有鉴定结果，本卡只标“待复核”，结果不覆盖`,
      };
    return {
      kind: "append" as const,
      text: `将作为补采接入现有链（第 ${existing.members.length + 1} 张卡），按采集时间排序`,
    };
  }, [form, data]);

  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = chainStore.register({
      caseNo: form.caseNo,
      location: form.location,
      collectedAt: localInputToIso(form.collectedAt),
      temperature: Number(form.temperature),
      exposureStage: form.exposureStage,
      species: form.species,
      stage: form.stage,
      preserve: form.preserve,
      note: form.note,
      identification: form.identification,
    });
    setOutcome(result);
    if (result.type !== "rejected" && !result.message.includes("退回")) {
      setForm((prev) => ({ ...blank(), caseNo: prev.caseNo, location: prev.location }));
    }
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>登记台</p>
          <h2>样本登记 / 补采登记</h2>
        </div>
        <button type="button" className="ghost" onClick={() => setForm(blank())}>
          清空
        </button>
      </div>

      <form onSubmit={submit} className="field-grid">
        <label>
          <span>案件编号 *</span>
          <input
            value={form.caseNo}
            onChange={(e) => update({ caseNo: e.target.value })}
            placeholder="例如 CASE-042"
          />
        </label>
        <label>
          <span>采样地点 *</span>
          <input
            value={form.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="例如 室外草地"
          />
        </label>
        <label>
          <span>采集时间 *（采集日相同才收链）</span>
          <input
            type="datetime-local"
            value={form.collectedAt}
            onChange={(e) => update({ collectedAt: e.target.value })}
          />
        </label>
        <label>
          <span>环境温度 (℃) *</span>
          <input
            type="number"
            step="0.1"
            value={form.temperature}
            onChange={(e) => update({ temperature: e.target.value })}
          />
        </label>
        <label>
          <span>尸体暴露阶段</span>
          <select
            value={form.exposureStage}
            onChange={(e) => update({ exposureStage: e.target.value })}
          >
            {EXPOSURE_STAGES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>昆虫种类 *</span>
          <input
            value={form.species}
            onChange={(e) => update({ species: e.target.value })}
            placeholder="例如 丝光绿蝇"
          />
        </label>
        <label>
          <span>发育阶段</span>
          <div className="segmented">
            {STAGES.map((item) => (
              <button
                type="button"
                key={item}
                className={form.stage === item ? "on" : ""}
                onClick={() => update({ stage: item })}
              >
                {item}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>保存方式</span>
          <select value={form.preserve} onChange={(e) => update({ preserve: e.target.value })}>
            {PRESERVE_METHODS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>鉴定结果 / 备注（主记录生效；补采在主记录已有结果时不覆盖）</span>
          <input
            value={form.identification}
            onChange={(e) => update({ identification: e.target.value })}
            placeholder="有鉴定结论时填写；作为补采且主记录已有结论时仅标记待复核"
          />
        </label>
        <label className="wide">
          <span>采集备注</span>
          <input
            value={form.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="生境、天气、取材部位等"
          />
        </label>

        {preview && (
          <p className={`rule-preview ${preview.kind}`}>
            <b>
              {preview.kind === "new"
                ? "新链"
                : preview.kind === "reject"
                  ? "将退回"
                  : preview.kind === "review"
                    ? "待复核"
                    : "补采"}
            </b>
            {preview.text}
          </p>
        )}

        {outcome && (
          <p
            className={`submit-note ${
              outcome.type === "rejected"
                ? "rejected"
                : outcome.type === "master-created"
                  ? "created"
                  : "accepted"
            }`}
          >
            {outcome.type === "rejected" ? "⛔ " : outcome.type === "master-created" ? "✓ " : "⛓ "}
            {outcome.message}
          </p>
        )}

        <div className="form-actions wide">
          <button className="primary" type="submit">
            提交登记卡
          </button>
        </div>
      </form>
    </section>
  );
}
