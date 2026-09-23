# hxyfront-62003 法医昆虫学样本记录

法医样本登记台，按"样本链"管理同批补采：纯前端实现，无后端、无新增运行时依赖，浏览器重开后从 localStorage 恢复。

## 样本链规则

- **归链键**：案件编号 + 采样地点 + 采集日（YYYY-MM-DD）相同的记录收成一条样本链。
- **主记录**：同键首条登记的记录为主记录（链内 `records[0]`，位置恒定）。
- **补采接续**：后续同键登记为补采，按采样时间在主记录之后依次接续。
- **鉴定结果不覆盖**：主记录已有鉴定结果时，新补采只标记"待复核"，补采备注不会改写主记录结论；录入结论时在链补采一并转入待复核。复核操作只改补采自身状态。
- **封存退回**：主记录封存（不可逆）后，同键补采申请一律退回，不进链、不改链，仅在"退回留痕"区留痕。
- 列表（案件样本关联）、发育阶段筛选、温度记录图、单个样本详情卡读取的都是同一条链。阶段筛选命中规则为链内任一记录处于该阶段。

## 分层结构

```
src/
├── domain/            规则层：纯函数 + 类型，不碰 localStorage / React
│   ├── types.ts       领域模型（SampleChain / SampleRecord / ReturnedApplication…）
│   └── rules.ts       归链、接续、待复核、封存退回、筛选、汇总等全部业务规则
├── storage/
│   └── storage.ts     存储层：localStorage 序列化/恢复 + 首次播种演示数据
├── components/        页面层：登记表单、阶段筛选、链列表、详情卡、温度图、退回留痕
│   ├── RegistrationForm.tsx
│   ├── StageFilterBar.tsx
│   ├── ChainList.tsx
│   ├── ChainDetail.tsx
│   ├── TemperatureChart.tsx   纯 SVG 折线图，无图表库
│   ├── ReturnedList.tsx
│   └── MetricStrip.tsx
├── App.tsx            组合三层：状态来自存储层，变更走规则层，页面只负责渲染
└── styles.css
```

localStorage 键：`forensic-chain-registry:v1`（带版本号与结构校验，损坏时回退播种数据）。

## 本地运行

```bash
npm install
npm run dev          # http://localhost:62003
```

其他命令：

```bash
npm run typecheck    # tsc --noEmit
npm run check:rules  # 样本链规则纯函数自检（29 项断言）
npm run build
```

开发端口：62003

## 首次播种数据

- CASE-042 室外草地：主记录已有鉴定结论，补采分别为已复核 / 待复核；
- CASE-051 水沟边缘：主记录待鉴定，补采正常接续、不挂待复核；
- CASE-077 阴影区域：已封存链，附一条被退回的补采申请留痕。
