# 洋流街机

一个部署在 Cloudflare Workers 上的网页小游戏集合。当前包含“深海进化”和五分钟数字门跑酷“战力突围”。

在线体验：[cf-gaming-web.jasonfeng1113.workers.dev](https://cf-gaming-web.jasonfeng1113.workers.dev)

## 当前玩法

### 战力突围

- 单局通关时间约 5 分 19 秒，包含 5 个独立战区、20 组数字门、10 波敌军、10 处路面障碍、5 个补给点和 5 场头目战
- 加减乘除门实时改变小队战力，路线选择会直接影响中途封锁和最终 5000 战力首领的胜负
- 三车道补给提供兵力与护盾，地雷可主动规避；护盾会优先吸收一次障碍伤害
- 编队随战力升级加入侦察兵、医疗兵、重装兵和机甲，敌人包含劫掠者、无人机、重装兵、炮塔与战车
- 海岸、荒漠、雪山、夜城和堡垒拥有不同场景色彩与关卡强度

### 深海进化

- 玩家在流式生成的海域中移动，相机平滑跟随，没有可见地图边框
- 13 种原创鱼类对应 13 个明确等级，进化时同时更换轮廓、配色和体型
- 成长价值按等级差逐级缩小到三分之一，升级所需同阶鱼数量也随等级提高
- 低阶和同阶鱼均可吞食，同阶鱼提供额外分数，高阶鱼会造成伤害，关系点提供即时提示
- 鱼群从视野外围成组进入并在离开后回收，刷新等级最高不超过玩家等级 `+2`，高等级鱼更加稀有
- 海雷会低频漂入探索区域，触碰后立即结束本局；经典模式达到 13 级后仍可继续狩猎
- 桌面端支持鼠标与 WASD/方向键，移动端支持触摸目标移动

## 技术栈

- React + TypeScript：游戏大厅、路由和 HUD
- Phaser 3：游戏循环、输入、碰撞与场景生命周期
- Vite + Cloudflare Vite Plugin：本地开发和生产构建
- Cloudflare Workers Static Assets：静态资源、SPA 回退与 `/api/*`
- Vitest + ESLint：规则测试和质量检查
- GitHub Actions：PR 持续集成、`main` 自动部署

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm install
npm run assets:build
npm run dev
```

常用命令：

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run deploy
```

游戏内保留可编辑 SVG 源素材，`npm run assets:build` 使用 Sharp 生成 Phaser 运行时加载的透明 PNG。

## 目录

```text
.
├── .github/workflows/ci.yml       # CI 与 Workers 部署
├── public/assets/                 # 原创游戏封面、场景和角色素材
├── src/
│   ├── app/                       # 应用入口与路由
│   ├── components/                # 大厅通用组件
│   ├── games/
│   │   ├── registry.ts            # 游戏清单
│   │   ├── ocean-growth/
│   │   │   ├── core/              # 可单测的纯玩法规则
│   │   │   └── game/              # Phaser 场景与生命周期封装
│   │   └── power-run/             # 五战区数字门跑酷
│   ├── pages/                     # 大厅页面
│   └── styles/                    # 全局视觉样式
├── worker/index.ts                # Worker API 和资源回退
├── vite.config.ts
└── wrangler.jsonc
```

新增游戏时，为游戏建立独立目录，在 `src/games/registry.ts` 中注册元数据，再按路由懒加载页面。游戏之间不共享可变状态；真正重复的纯规则出现后，再抽取共享包。

## GitHub Actions 部署

仓库需要配置两个 Actions Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

API Token 只授予目标 Cloudflare 账户的 Workers 编辑权限。不要将 Token 写入仓库。PR 会执行 lint、类型检查、测试与生产构建；`main` 分支通过相同门禁后执行 `wrangler deploy`。Secrets 尚未配置时，部署步骤会明确跳过，质量门禁仍保持可用。

## Worker 路由

- 静态文件优先由 Cloudflare 全球缓存提供
- 未命中的前端路径回退到 SPA 的 `index.html`
- `/api/health` 由 Worker 执行
- 其他 `/api/*` 当前返回 JSON 404，后续可接 D1 排行榜和限流

## 许可证

项目代码和仓库内原创 SVG 素材使用 [MIT License](./LICENSE)。调研过的第三方仓库没有复制进本项目，记录见 [docs/research.md](./docs/research.md)。
