import { useMemo, useState } from "react";
import {
  buildChains,
  formatTime,
  temperatureSeries,
  type TemperaturePoint,
} from "../rules/chainRules";
import { useChainStore } from "../hooks/useChainStore";

// 温度图读链：每条链一条折线，链上每张卡（含补采）都是一个温度观测点。
const COLORS = ["#365314", "#a16207", "#dc2626", "#2563eb", "#7c3aed", "#0f766e", "#be185d"];

const W = 880;
const H = 320;
const PAD = { top: 24, right: 20, bottom: 44, left: 52 };

export default function TemperatureChart() {
  const data = useChainStore();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const { chains, series, minTime, maxTime, minTemp, maxTemp } = useMemo(() => {
    const chainsList = buildChains(data.records, data.sealedMasterIds);
    const seriesMap = temperatureSeries(chainsList);
    const allPoints: TemperaturePoint[] = [];
    seriesMap.forEach((points) => allPoints.push(...points));
    let minTime = Infinity;
    let maxTime = -Infinity;
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    for (const point of allPoints) {
      minTime = Math.min(minTime, point.time);
      maxTime = Math.max(maxTime, point.time);
      minTemp = Math.min(minTemp, point.temperature);
      maxTemp = Math.max(maxTemp, point.temperature);
    }
    return { chains: chainsList, series: seriesMap, minTime, maxTime, minTemp, maxTemp };
  }, [data]);

  const toggle = (chainId: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      return next;
    });

  if (chains.length === 0) {
    return (
      <section className="panel">
        <div className="heading">
          <div>
            <p>温度记录</p>
            <h2>环境温度记录图</h2>
          </div>
        </div>
        <p className="empty">暂无温度数据。</p>
      </section>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const timeSpan = Math.max(maxTime - minTime, 60 * 60 * 1000);
  const tempLow = Math.floor(minTemp - 2);
  const tempHigh = Math.ceil(maxTemp + 2);
  const tempSpan = Math.max(tempHigh - tempLow, 1);

  const x = (time: number) => PAD.left + ((time - minTime) / timeSpan) * plotW;
  const y = (temp: number) => PAD.top + plotH - ((temp - tempLow) / tempSpan) * plotH;

  const ticks = 4;
  const xTicks = Array.from({ length: ticks + 1 }, (_, i) => minTime + (timeSpan * i) / ticks);
  const yTicks = Array.from({ length: tempHigh - tempLow + 1 }, (_, i) => tempLow + i);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>温度记录</p>
          <h2>
            环境温度记录图 <small>按样本链着色 · 点为单张登记卡</small>
          </h2>
        </div>
      </div>

      <div className="chips chart-legend">
        {chains.map((chain, index) => {
          const color = COLORS[index % COLORS.length];
          const isHidden = hidden.has(chain.id);
          return (
            <button
              key={chain.id}
              className={`legend-chip ${isHidden ? "off" : ""}`}
              onClick={() => toggle(chain.id)}
              title="点击显示/隐藏该链"
            >
              <span className="legend-swatch" style={{ background: color }} />
              {chain.caseNo} · {chain.location}
            </button>
          );
        })}
      </div>

      <svg className="temp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="温度记录折线图">
        {yTicks.map((temp) => (
          <g key={temp}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(temp)}
              y2={y(temp)}
              className="grid-line"
            />
            <text x={PAD.left - 8} y={y(temp) + 4} className="axis-label" textAnchor="end">
              {temp}℃
            </text>
          </g>
        ))}
        {xTicks.map((time, index) => (
          <text
            key={index}
            x={x(time)}
            y={H - PAD.bottom + 18}
            className="axis-label"
            textAnchor="middle"
          >
            {formatTime(new Date(time).toISOString())}
          </text>
        ))}

        {chains.map((chain, index) => {
          if (hidden.has(chain.id)) return null;
          const points = series.get(chain.id) ?? [];
          const color = COLORS[index % COLORS.length];
          const path = points
            .map((point, i) => `${i === 0 ? "M" : "L"} ${x(point.time)} ${y(point.temperature)}`)
            .join(" ");
          return (
            <g key={chain.id}>
              {points.length > 1 && <path d={path} fill="none" stroke={color} strokeWidth={2} />}
              {points.map((point) => (
                <g key={point.recordId} className="chart-point">
                  <circle cx={x(point.time)} cy={y(point.temperature)} r={4.5} fill={color} />
                  <title>
                    {chain.caseNo} · {chain.location}
                    {"\n"}
                    {formatTime(new Date(point.time).toISOString())} · {point.temperature}℃
                    {"\n"}
                    {point.label}
                  </title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
