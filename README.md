# USO / BNO 原油 ETF 持仓报告

面向移动端的原油 ETF 数据报告，视觉和信息层级延续黄金 ETF 版本。页面可切换查看 USO（WTI）与 BNO（Brent），并针对期货型原油产品改写数据口径。

## 数据范围

- 当前持仓：USCF 官方 USO / BNO 期货、掉期、现金与等价物持仓
- 历史数据：USCF 官方 USO / BNO 近 5 年每日 NAV 与总资产净值
- 当前指标：桶等值名义敞口、申赎驱动的持仓变化估算、原油名义市值、NAV、总资产、流通份额、申赎、溢折价
- 数据模式：静态冻结快照；页面端不会轮询

## 桶等值算法

- 期货：合约数量 × 1,000 桶/手，直接采用 CME（WTI）或 ICE（Brent）的标准合约规格。
- 掉期：官方披露的掉期名义市值 ÷ 同日基金期货持仓的桶数加权结算价。掉期的披露数量不是天然的“桶”，因此不再直接按一份等于一桶处理。
- 历史持仓变化：每日总净资产 ÷ NAV 反推流通份额，以当前官方流通份额为锚，再按官方最小申赎篮子取整（USO 100,000 份；BNO 50,000 份）。每日份额增减 × 当前每份名义桶数，得到申赎驱动的持仓桶数变化估算。

这套算法会把“油价上涨但基金份额没变”的日期识别为持仓基本不变，避免把资产升值误判成增持。历史桶数仍是估算，因为 USCF 公开接口只提供最新持仓，没有可回溯的逐日合约明细；它不包含展期或主动调仓造成的桶数变化，也不代表实物原油库存。切换“按美元”时展示的仍是 USCF 官方总资产净值变化原值。

## 本地运行

```bash
npm install
npm run dev
```

## 人工更新数据

```bash
npm run data:refresh
```

该命令会从 USCF 页面使用的公开接口生成 `public/data/uso-snapshot.json` 和 `public/data/bno-snapshot.json`，不会保存接口令牌。更新数据后应重新执行：

```bash
npm test
npm run lint
```

## 主要文件

- `app/OilEtfReport.tsx`：报告交互与数据可视化
- `app/globals.css`：移动端页面样式
- `public/data/uso-snapshot.json`：上线使用的冻结数据快照
- `public/data/bno-snapshot.json`：BNO 上线使用的冻结数据快照
- `scripts/fetch-uso-snapshot.mjs`：人工更新脚本
- `tests/rendered-html.test.mjs`：渲染与数据一致性检查

## 官方来源

- [USCF USO Holdings](https://www.uscfinvestments.com/holdings/uso)
- [USCF USO Product Page](https://www.uscfinvestments.com/uso)
- [USO 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1327068/000110465926021501/uso-20251231x10k.htm)
- [CME WTI Crude Oil Futures Contract Specs](https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.contractSpecs.html)
- [USCF BNO Holdings](https://www.uscfinvestments.com/holdings/bno)
- [USCF BNO Product Page](https://www.uscfinvestments.com/bno)
- [BNO 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1472494/000110465926021521/bno-20251231x10k.htm)
- [ICE Brent Crude Futures Contract Specs](https://www.ice.com/products/219/Brent-Crude-Futures)
