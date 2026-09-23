import { FormEvent, useEffect, useMemo, useState } from "react";
import { DraftErrors, validateDraft } from "../domain/rules";
import { EXPOSURE_STAGES, PRESERVATIONS, STAGES, SampleDraft } from "../domain/types";

export interface LockTarget {
  caseNo: string;
  location: string;
  date: string;
  sealed: boolean;
}

export interface RegisterNotice {
  tone: "ok" | "warn";
  text: string;
}

function nowLocalInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}

const EMPTY: SampleDraft = {
  caseNo: "",
  location: "",
  collectedAt: nowLocalInput(),
  temperature: "",
  exposureStage: EXPOSURE_STAGES[0],
  species: "",
  stage: "",
  preservation: PRESERVATIONS[0],
  note: "",
};

export default function RegistrationForm({
  lock,
  notice,
  onSubmit,
  onClearLock,
}: {
  lock: LockTarget | null;
  notice: RegisterNotice | null;
  onSubmit: (draft: SampleDraft) => void;
  onClearLock: () => void;
}) {
  const [draft, setDraft] = useState<SampleDraft>(EMPTY);
  const [errors, setErrors] = useState<DraftErrors>({});

  // 锁定案件/地点/采集日：后续补采沿用同一组键，保证被收成同一条链
  useEffect(() => {
    if (lock) {
      setDraft((prev) => ({
        ...prev,
        caseNo: lock.caseNo,
        location: lock.location,
        collectedAt: `${lock.date}T${prev.collectedAt.slice(11, 16) || "12:00"}`,
        note: "",
      }));
    }
  }, [lock]);

  const set = <K extends keyof SampleDraft>(key: K, value: SampleDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const lockedKeys = lock !== null;
  const lockHint = useMemo(() => {
    if (!lock) return null;
    return lock.sealed
      ? `已锁定封存链 ${lock.caseNo} · ${lock.location} · ${lock.date}，提交将被退回`
      : `补采模式：${lock.caseNo} · ${lock.location} · ${lock.date}，同键记录接入主记录链`;
  }, [lock]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(draft);
    setDraft({
      ...EMPTY,
      collectedAt: nowLocalInput(),
      caseNo: lock?.caseNo ?? "",
      location: lock?.location ?? "",
    });
    setErrors({});
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>样本登记台</p>
          <h2>{lockedKeys ? "补采登记" : "新样本登记"}</h2>
        </div>
        {lockedKeys && (
          <button type="button" className="ghost" onClick={onClearLock}>
            解除锁定 / 新建链
          </button>
        )}
      </div>

      {lockHint && <div className={lock?.sealed ? "lock-banner danger" : "lock-banner"}>{lockHint}</div>}
      {notice && <div className={notice.tone === "warn" ? "form-notice warn" : "form-notice"}>{notice.text}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field-grid">
          <label className={lockedKeys ? "locked" : ""}>
            <span>案件编号 *</span>
            <input
              value={draft.caseNo}
              readOnly={lockedKeys}
              placeholder="如 CASE-042"
              onChange={(e) => set("caseNo", e.target.value)}
            />
            {errors.caseNo && <small className="error-text">{errors.caseNo}</small>}
          </label>
          <label className={lockedKeys ? "locked" : ""}>
            <span>采样地点 *</span>
            <input
              value={draft.location}
              readOnly={lockedKeys}
              placeholder="如 室外草地"
              onChange={(e) => set("location", e.target.value)}
            />
            {errors.location && <small className="error-text">{errors.location}</small>}
          </label>
          <label className={lockedKeys ? "locked" : ""}>
            <span>采样时间（含采集日）*</span>
            <input
              type="datetime-local"
              value={draft.collectedAt}
              readOnly={lockedKeys}
              onChange={(e) => set("collectedAt", e.target.value)}
            />
            {errors.collectedAt && <small className="error-text">{errors.collectedAt}</small>}
          </label>
          <label>
            <span>环境温度（℃）</span>
            <input
              type="number"
              step="0.1"
              min={-30}
              max={60}
              value={draft.temperature}
              placeholder="如 28.6"
              onChange={(e) => set("temperature", e.target.value)}
            />
            {errors.temperature && <small className="error-text">{errors.temperature}</small>}
          </label>
          <label>
            <span>尸体暴露阶段</span>
            <select value={draft.exposureStage} onChange={(e) => set("exposureStage", e.target.value)}>
              {EXPOSURE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>昆虫种类 *</span>
            <input
              value={draft.species}
              placeholder="如 丝光绿蝇"
              onChange={(e) => set("species", e.target.value)}
            />
            {errors.species && <small className="error-text">{errors.species}</small>}
          </label>
          <label>
            <span>发育阶段 *</span>
            <select value={draft.stage} onChange={(e) => set("stage", e.target.value as SampleDraft["stage"])}>
              <option value="">请选择</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {errors.stage && <small className="error-text">{errors.stage}</small>}
          </label>
          <label>
            <span>保存方式</span>
            <select value={draft.preservation} onChange={(e) => set("preservation", e.target.value)}>
              {PRESERVATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>鉴定备注 / 鉴定结果（仅主记录填写才作为链结论；补采填写不覆盖主记录）</span>
            <textarea
              rows={3}
              value={draft.note}
              placeholder="如 三龄幼虫，初步鉴定丝光绿蝇……"
              onChange={(e) => set("note", e.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className={lock?.sealed ? "primary danger-btn" : "primary"}>
            {lockedKeys ? "提交补采申请" : "登记样本"}
          </button>
          <span className="hint">链键 = 案件编号 + 采样地点 + 采集日</span>
        </div>
      </form>
    </section>
  );
}
