import { Stage, STAGES } from "../domain/types";

export type StageFilter = Stage | "全部";

const OPTIONS: StageFilter[] = ["全部", ...STAGES];

export default function StageFilterBar({
  value,
  onChange,
  counts,
}: {
  value: StageFilter;
  onChange: (value: StageFilter) => void;
  counts: Record<StageFilter, number>;
}) {
  return (
    <div className="chips" role="group" aria-label="发育阶段筛选">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "chip active" : "chip"}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option}
          <em>{counts[option]}</em>
        </button>
      ))}
    </div>
  );
}
