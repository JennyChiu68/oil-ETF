# USO 原油 ETF 持仓报告

面向移动端的原油 ETF 数据报告，视觉和信息层级延续黄金 ETF 版本，并针对期货型原油产品改写数据口径。

## 数据范围

- 当前持仓：USCF 官方 USO 期货、掉期、现金与等价物持仓
- 历史数据：USCF 官方近 5 年每日 NAV 与总资产净值
- 当前指标：桶等值名义敞口、原油名义市值、NAV、总资产、流通份额、申赎、溢折价
- 数据模式：静态冻结快照；页面端不会轮询

`桶等值`是油价相关名义敞口，不是实物原油库存。总资产净值变化包含市场价格、申赎、抵押品收益和费用影响，不等同于净资金流。

## 本地运行

```bash
npm install
npm run dev
```

## 人工更新数据

```bash
npm run data:refresh
```

该命令会从 USCF 页面使用的公开接口生成 `public/data/uso-snapshot.json`，不会保存接口令牌。更新数据后应重新执行：

```bash
npm test
npm run lint
```

## 主要文件

- `app/OilEtfReport.tsx`：报告交互与数据可视化
- `app/globals.css`：移动端页面样式
- `public/data/uso-snapshot.json`：上线使用的冻结数据快照
- `scripts/fetch-uso-snapshot.mjs`：人工更新脚本
- `tests/rendered-html.test.mjs`：渲染与数据一致性检查

## 官方来源

- [USCF USO Holdings](https://www.uscfinvestments.com/holdings/uso)
- [USCF USO Product Page](https://www.uscfinvestments.com/uso)
- [USO 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1327068/000110465926021501/uso-20251231x10k.htm)
