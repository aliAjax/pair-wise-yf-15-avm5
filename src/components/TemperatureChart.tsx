import { useMemo } from "react";
import { timeKey } from "../domain/rules";
import { SampleRecord } from "../domain/types";

// 温度记录图：读取整条样本链（含补采），按采样时间排列。
// 纯 SVG 手绘折线，不引入任何图表库。
export default function TemperatureChart({
  records,
  height = 190,
}: {
  records: SampleRecord[];
  height?: number;
}) {
  const points = useMemo(
    () =>
      records
        .filter((r) => r.temperature !== null)
        .map((r) => ({ t: timeKey(r.collectedAt), value: r.temperature as number, label: r.collectedAt.slice(11, 16) }))
        .sort((a, b) => a.t - b.t),
    [records],
  );

  const width = 560;
  const padX = 42;
  const padTop = 18;
  const padBottom = 34;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  if (points.length === 0) {
    return (
      <div className="chart-empty" style={{ minHeight: height }}>
        该链暂无温度记录
      </div>
    );
  }

  const values = points.map((p) => p.value);
  let min = Math.floor(Math.min(...values) - 1);
  let max = Math.ceil(Math.max(...values) + 1);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;

  const x = (i: number) =>
    points.length === 1 ? padX + innerW / 2 : padX + (i * innerW) / (points.length - 1);
  const y = (v: number) => padTop + innerH - ((v - min) / span) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const last = points[points.length - 1];

  return (
    <svg className="temp-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="样本链温度记录图">
      {ticks.map((k) => {
        const ty = padTop + innerH * k;
        const tv = max - span * k;
        return (
          <g key={k}>
            <line x1={padX} y1={ty} x2={width - padX} y2={ty} className="grid-line" />
            <text x={padX - 8} y={ty + 4} className="axis-text" textAnchor="end">
              {tv.toFixed(0)}
            </text>
          </g>
        );
      })}
      <line x1={padX} y1={padTop} x2={padX} y2={padTop + innerH} className="axis-line" />
      <line x1={padX} y1={padTop + innerH} x2={width - padX} y2={padTop + innerH} className="axis-line" />

      <path d={line} className="temp-line" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={4} className="temp-dot" />
          <text x={x(i)} y={height - 12} className="axis-text" textAnchor="middle">
            {p.label}
          </text>
          <text x={x(i)} y={y(p.value) - 9} className="temp-value" textAnchor="middle">
            {p.value.toFixed(1)}
          </text>
        </g>
      ))}
      <text x={width - padX} y={12} className="axis-text" textAnchor="end">
        最新 {last.value.toFixed(1)}℃ · 单位 ℃
      </text>
    </svg>
  );
}
