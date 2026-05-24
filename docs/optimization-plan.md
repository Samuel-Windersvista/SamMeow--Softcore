# Softcore MOD 代码审查与优化实施计划

> 审查日期：2026-05-24 | 目标版本：SPT 3.11.4 | MOD 版本：3.3.0
>
> 本计划基于对整个代码库的静态分析，包含已确认的问题及优化建议，按优先级排序。

---

## 一、BUG 修复（严重 - 应尽快修复）

### B1. Softcore.ts — 模板字面量未生效

**位置**：`src/Softcore.ts:24`, `src/Softcore.ts:32`

**问题**：使用普通字符串包裹 `${error.message}`，而非反引号模板字面量。错误信息中的变量插值永远不会执行。

```typescript
// 当前代码 (第 24 行)
logger.error("[Softcore]: ${error.message}, stopping mod")

// 应该为
logger.error(`[Softcore]: ${error.message}, stopping mod`)
```

同理第 32 行：
```typescript
// 当前
this.logger.error("ConfigServer: ${error.message}")

// 应该为
this.logger.error(`ConfigServer: ${error.message}`)
```

**严重程度**：**严重** — 调试时看不到真实错误信息，线上排查极其困难。

**修复**：替换为反引号模板字面量。

**工作量**：1 分钟

---

### B2. OtherTweaksChanger.ts — Boss 弹药修正逻辑错误

**位置**：`src/changers/OtherTweaksChanger.ts:224-232`

**问题**：`doBiggerAmmoStacks` 在遍历所有弹药物品的循环内部执行 `botConfig.secureContainerAmmoStackCount` 的除法修正。假设游戏中有 200 种弹药，这行代码会被执行 200 次：

```typescript
// 当前代码
doBiggerAmmoStacks(stackMultiplier: number, botAmmoStackFix: boolean) {
    for (const item of Object.values(this.items)) {
        if (item._parent === BaseClasses.AMMO && item._props.StackMaxSize) {
            item._props.StackMaxSize *= stackMultiplier
            if (botAmmoStackFix) {
                this.botConfig.secureContainerAmmoStackCount = Math.round(
                    this.botConfig.secureContainerAmmoStackCount / stackMultiplier  // BUG: 循环内重复除以
                )
            }
        }
    }
}
```

假设原值 600，stackMultiplier=10：
- 第一次迭代：600/10 = 60
- 第二次迭代：60/10 = 6
- 第 N 次迭代：趋近于 0

**严重程度**：**严重** — Boss 生成的弹药数量会趋近于 0，导致 Boss 弹药不足。

**修复**：将 `botAmmoStackFix` 逻辑移到循环外：

```typescript
doBiggerAmmoStacks(stackMultiplier: number, botAmmoStackFix: boolean) {
    for (const item of Object.values(this.items)) {
        if (item._parent === BaseClasses.AMMO && item._props.StackMaxSize) {
            item._props.StackMaxSize *= stackMultiplier
        }
    }
    if (botAmmoStackFix) {
        this.botConfig.secureContainerAmmoStackCount = Math.round(
            this.botConfig.secureContainerAmmoStackCount / stackMultiplier
        )
    }
}
```

**工作量**：2 分钟

---

### B3. recipes.ts — 重复配方定义

**位置**：`src/assets/recipes.ts:543-577` (P22), `src/assets/recipes.ts:636-670` (PNB), `src/assets/recipes.ts:706-740` (SJ9), `src/assets/recipes.ts:741-774` (SJ12)

**问题**：P22、PNB、SJ9、SJ12 四个配方的 `endProduct` 完全相同（`5ed515c8d380ab312177c0fa` = 3-b-TG），且制作要求和产出数量完全相同。ThreebTG（第 389 行）也是同样的产出。

实际上算上 ThreebTG，有 **5 个配方**产出完全相同的 3-b-TG。这显然是复制粘贴时忘记修改 `endProduct` 的结果。

**严重程度**：**严重** — 出现 5 个重复的 3-b-TG 配方，且 P22（预期产出 P22 刺激剂？）、SJ9（预期产出 SJ9？）、SJ12（预期产出 SJ12？）等物品缺少应有的配方。

**修复**：确认每个配方的预期产出物品，修正 `endProduct` 字段。例如：
- PNB 的 `endProduct` 应为 PNB 对应物品
- SJ9 的 `endProduct` 应为 SJ9 刺激剂对应的 ItemTpl
- SJ12 的 `endProduct` 应为 SJ12 刺激剂对应的 ItemTpl

**工作量**：需要查表确认正确的 ItemTpl ID，然后修改 3 个配方。约 15 分钟。

---

### B4. TraderChangesChanger.ts — 拼写错误

**位置**：`src/changers/TraderChangesChanger.ts:22`, `src/changers/TraderChangesChanger.ts:33`

**问题**：属性名 `stacticTraderList` 拼写错误，应为 `staticTraderList`。这不会导致运行时错误（因为 JavaScript 对象属性没有限制），但影响代码可读性和可维护性。

**严重程度**：**轻微** — 不影响功能，但应在重构时修复。

**修复**：重命名为 `staticTraderList`。

**工作量**：1 分钟

---

### B5. TraderChangesChanger.ts:120 — buy_price_coef 逻辑错误

**位置**：`src/changers/TraderChangesChanger.ts:118-128`

**问题**：`doBetterSalesToTraders` 中使用了 traderID（哈希字符串）而非 trader 名称来查表：

```typescript
for (const [trader, traderID] of Object.entries(this.stacticTraderList)) {
    if (!Object.keys(buyPriceAdjustment).includes(traderID)) {  // 检查的是 24 字符哈希
        continue
    }
}
```

`buyPriceAdjustment` 的键是 `Traders.PEACEKEEPER` 等枚举值（如 `"5935c25fb3acc3127c3d8cd9"`），而 `stacticTraderList` 的值也是同样格式的哈希字符串。这个逻辑实际上能匹配，但 `buy_price_coef` 的递减逻辑有问题：

```typescript
for (const loyaltyLevel of this.tables.traders![traderID].base.loyaltyLevels) {
    loyaltyLevel.buy_price_coef = buyPriceCoef
    loyaltyLevel.buy_price_coef += buyPriceAdjustment[traderID]
    buyPriceCoef -= 5
}
```

第一个忠诚度等级 buy_price_coef = 35 + adjustment，之后每个等级在此基础上递减。这导致 35 这个基准值只在第一个 trader 生效，后续 trader 的后续等级会累积递减。这可能不是预期行为 — 每个 trader 应该有自己独立的起始值。

**严重程度**：**中等** — 可能导致部分商人收购价计算结果与预期不符。

**修复**：将 `buyPriceCoef` 的初始化移入 trader 循环内：

```typescript
for (const [trader, traderID] of Object.entries(this.stacticTraderList)) {
    if (!Object.keys(buyPriceAdjustment).includes(traderID)) {
        continue
    }
    let buyPriceCoef = 35  // 每个 trader 独立起始
    for (const loyaltyLevel of this.tables.traders![traderID].base.loyaltyLevels) {
        loyaltyLevel.buy_price_coef = buyPriceCoef + buyPriceAdjustment[traderID]
        buyPriceCoef -= 5
    }
}
```

**工作量**：2 分钟

---

### B6. InsuranceChangesChanger.ts — 变量名遮蔽

**位置**：`src/changers/InsuranceChangesChanger.ts:19`

**问题**：
```typescript
const ConfigServer = container.resolve<ConfigServer>("ConfigServer")
```

局部变量 `ConfigServer` 与导入的类名 `ConfigServer` 冲突。虽然 JavaScript/TypeScript 允许这样做（变量遮蔽类名），但这是不良实践，容易造成混淆。

**严重程度**：**轻微**

**修复**：重命名为小写 `configServer`。

**工作量**：30 秒

---

## 二、性能优化（中等优先级）

### P1. ScavCaseOptionsChanger.doBetterRewards — 遍历优化

**位置**：`src/changers/ScavCaseOptionsChanger.ts:76-164`

**问题**：`doBetterRewards` 使用 `for (const i in items)` 遍历所有物品模板（可能有数千个），每条物品内部还有多次函数调用（`getTemplatePrice`、`isItemBlacklisted`、`isBossItem`、`isItemRewardBlacklisted`、`itemIsSeasonalRelated` 等）。这是 MOD 加载阶段最耗时的操作之一。

**当前复杂度**：O(N * M)，其中 N 是物品总数（~3000+），M 是检查函数数量。

**优化建议**：
1. 使用 `for...of` 替代 `for...in`（遍历数组/Record 值时语义更清晰，且没有原型链遍历风险）
2. 将 `handbookPrice >= 10000` 等简单检查前置，短路避免不需要的复杂检查
3. 缓存部分函数的调用结果

**预计收益**：可能减少 10-20% 的 MOD 加载时间。

**工作量**：30 分钟

---

### P2. OtherTweaksChanger — 多次遍历优化

**位置**：`src/changers/OtherTweaksChanger.ts:165-183, 187-192, 195-207, 211-215`

**问题**：`doUnexaminedItemsAreBack`、`doFasterExamineTime`、`doRemoveBackpackRestrictions`、`doRemoveDiscardLimit` 各自独立遍历所有物品（每次 ~3000+ 次迭代），如果这些选项全部开启，会遍历物品表 4 次。

**优化建议**：合并这些遍历为单次遍历，在同一个循环中处理所有需要修改的属性。

```typescript
// 单次遍历实现所有物品级修改
for (const item of Object.values(this.items)) {
    // doUnexaminedItemsAreBack
    if (!skipUnexamined(item) && item._props.ExaminedByDefault) {
        item._props.ExaminedByDefault = false
    }
    // doFasterExamineTime
    if (item._props.ExamineTime) {
        item._props.ExamineTime = 0.2
    }
    // doRemoveDiscardLimit
    if (item._type === ItemType.ITEM) {
        item._props.DiscardLimit = -1
    }
    // doRemoveBackpackRestrictions (已有独立复杂逻辑，保持单独处理更清晰)
}
```

**预计收益**：减少 3 次物品表全遍历，约 25% 的 OtherTweaksChanger 开销。

**工作量**：1 小时

---

### P3. ScavCaseOptionsChanger.doBetterRewards — 弹药箱价格修正

**位置**：`src/changers/ScavCaseOptionsChanger.ts:117-135`

**问题**：弹药箱价格修正部分每次 MOD 加载都会修改 `handbook` 表，但这是一个静态修正。除非 SPT 升级重建 handbook，否则不需要每次都重新计算。

**优化建议**：可将这些修正值硬编码到配置或静态数据文件中，避免每次都查询 `StackSlots` 和重新计算价格。

**目前仍是安全的**（SPT 每次启动都会重新加载数据库），但减少计算可加快启动。

**工作量**：20 分钟

---

### P4. 资产文件中的大数组初始化

**位置**：`src/assets/fleamarket.ts` (785 行), `src/assets/scavcase.ts` (310 行)

**问题**：
- `BSGblacklist` 数组包含 360+ 个硬编码的物品 ID 字符串。每次导入模块时都需要在内存中创建这么大的数组。
- 这些数组可以通过 `Set` 数据结构优化查找效率。例如 `ScavCaseOptionsChanger` 中多次使用 `.includes()` 对大数组做线性搜索。

**优化建议**：
1. 将 `BSGblacklist`、`scavcaseItemBlacklist` 转换为 `Set<string>` 以提供 O(1) 查找
2. 考虑将 BSG 黑名单存储为 JSON 文件而非 TypeScript 源码，便于脚本化更新

**预计收益**：轻微的内存和查找性能提升。

**工作量**：30 分钟

---

## 三、代码质量改进（低优先级）

### Q1. 过度使用非空断言操作符

**位置**：遍布整个代码库，尤其在 changer 文件中

**问题**：大量使用 `!`（非空断言），例如：
- `this.tables.hideout!` 
- `globals!`
- `this.items!`
- `traderList!`

在 TypeScript 严格模式下，这些绕过类型检查。如果 SPT API 变更导致返回值意外为 null/undefined，会发生运行时错误而非编译时捕获。

**改进建议**：在关键路径上添加 null 检查：

```typescript
// 当前
const hideout = this.tables.hideout!

// 建议
const hideout = this.tables.hideout
if (!hideout) {
    this.logger.warning("Hideout table not found, skipping")
    return
}
```

**工作量**：3-4 小时（渐进式，不需要一次做完）

---

### Q2. 错误处理不一致

**位置**：所有 changer 文件

**问题**：错误处理使用 `console.warn(error)` 而非 `this.logger.warning()`：
```typescript
catch (error) {
    this.logger.warning("... failed gracefully. Send bug report. Continue safely.")
    console.warn(error)  // 应使用 logger
}
```

**改进建议**：统一使用 `PrefixLogger` 输出错误详情：
```typescript
catch (error) {
    this.logger.warning(`... failed: ${error.message}. Continue safely.`)
}
```

**工作量**：30 分钟

---

### Q3. OtherTweaksChanger.ts — 未使用的导入

**位置**：`src/changers/OtherTweaksChanger.ts:14`

**问题**：`import { log } from "node:console"` — `log` 在文件中未被使用。

**修复**：删除该行。

**工作量**：10 秒

---

### Q4. TraderChangesChanger.doAlternativeCategories — 数组展开语法

**位置**：`src/changers/TraderChangesChanger.ts:134`

**问题**：
```typescript
traderList![Traders.THERAPIST].base.items_buy.category.push(...[BaseClasses.MEDICAL_SUPPLIES, BaseClasses.HOUSEHOLD_GOODS])
```

`...[a, b]` 展开数组与直接用 `.push(a, b)` 完全等价，但多了一次不必要的数组创建和展开操作。可简化为：
```typescript
traderList![Traders.THERAPIST].base.items_buy.category.push(BaseClasses.MEDICAL_SUPPLIES, BaseClasses.HOUSEHOLD_GOODS)
```

**工作量**：10 秒

---

### Q5. TraderChangesChanger.doPacifistFence — 死代码

**位置**：`src/changers/TraderChangesChanger.ts:160-173`

**问题**：`if (false) { ... }` 包裹的大型调试代码块。虽然 Biome 已标记为忽略，但死代码会增加维护负担。

**改进建议**：移除或改为通过 debug 配置开关控制。

**工作量**：5 分钟

---

### Q6. PrefixLogger — 所有 changer 的构造函数重复模式

**位置**：所有 changer 文件

**问题**：几乎所有 changer 的构造函数都重复相同的模式：
```typescript
constructor(container: DependencyContainer) {
    this.logger = PrefixLogger.getInstance()
    const databaseServer = container.resolve<DatabaseServer>("DatabaseServer")
    this.tables = databaseServer.getTables()
}
```

**改进建议**：提取基类 `BaseChanger`：
```typescript
export class BaseChanger {
    protected logger: PrefixLogger
    protected tables: IDatabaseTables
    
    constructor(container: DependencyContainer) {
        this.logger = PrefixLogger.getInstance()
        this.tables = container.resolve<DatabaseServer>("DatabaseServer").getTables()
    }
}
```

然后所有 changer 继承基类，减少样板代码并确保一致性。

**工作量**：1-2 小时

---

## 四、SPT 兼容性问题

### C1. BSGblacklist 需要随 SPT 版本更新

**位置**：`src/assets/fleamarket.ts:425-785`

**问题**：代码注释明确指出 "hardcoded for safety, NEED TO UPDATE ON NEW PATCHES!!!!!!!"。这个 360 行的黑名单来自 SPT 3.10.2，当 SPT 升级时可能需要更新。

**当前状态**：已知需要关注，已有明显警告。目前使用 SPT 3.11.x 版本，需要确认 BSG 黑名单是否已变更。

**建议**：将 BSG 黑名单的外部获取做成自动化脚本，或至少添加版本检查。

---

### C2. 隐藏的 API 依赖

**问题**：Softcore 直接修改了多个 SPT 内部配置对象（如 `IRagfairConfig`、`IHideoutConfig`、`IInsuranceConfig`、`ITraderConfig`、`IBotConfig`）。这些接口可能在 SPT 小版本升级时变更。

**当前缓解措施**：`types.ts` 中的配置接口是独立定义的，与 SPT 接口解耦。但 changer 中使用的 SPT 接口（如 `ragfairConfig.dynamic.blacklist.custom` 等）是强依赖。

**建议**：在每次 SPT 更新后验证所有直接访问的 config 路径是否仍然有效。

---

## 五、实施优先级排序

| 优先级 | 编号 | 描述 | 预计时间 | 影响 |
|--------|------|------|----------|------|
| P0 | B1 | 模板字面量错误 | 1 分钟 | 调试体验 |
| P0 | B2 | Boss 弹药修正逻辑错误 | 2 分钟 | Boss 游戏性 |
| P0 | B3 | 重复配方定义 | 15 分钟 | 游戏内容 |
| P1 | B5 | buy_price_coef 逻辑 | 2 分钟 | 商人卖价 |
| P1 | P1 | ScavCase 遍历优化 | 30 分钟 | 启动性能 |
| P1 | P2 | 物品表多次遍历合并 | 1 小时 | 启动性能 |
| P2 | Q1 | 非空断言改进 | 3-4 小时 | 健壮性 |
| P2 | Q6 | 提取 BaseChanger 基类 | 1-2 小时 | 可维护性 |
| P3 | B4/B6/Q2/Q3/Q4/Q5 | 代码清洁 | 1 小时 | 代码质量 |
| P3 | P3/P4 | 数据缓存/Set优化 | 50 分钟 | 微优化 |
| P3 | C1/C2 | 兼容性文档 | 持续 | SPT 升级 |

### 建议实施批次

**第一批（立即）**：B1, B2, B3 — 三个严重 bug 共约 20 分钟

**第二批（本周内）**：B5, P1, P2 — 性能改进和逻辑修正约 1.5 小时

**第三批（下个版本）**：Q1, Q6 — 代码质量改进约 5 小时

**第四批（持续）**：其余代码清洁和兼容性维护

---

Vault-Tec 质量控制部认证：本代码审查经过 ROBCO UOS v.84.2.39 标准检测流程。辐射泄漏等级：可接受。
Prepare for the Future!
