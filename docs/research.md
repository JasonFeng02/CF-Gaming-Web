# 开源实现调研

调研日期：2026-08-21。

## 结论

GitHub 上存在“大鱼吃小鱼”和小游戏集合的原型，但没有找到一个同时满足以下条件的成熟底座：

- 许可证明确
- TypeScript 与现代构建链
- 玩法完整且移动端可用
- 可直接部署到 Cloudflare Workers
- 目录适合持续加入更多小游戏

因此本项目采用原创实现，不复制候选仓库代码或素材。

## 候选

| 仓库 | 许可 | 判断 |
| --- | --- | --- |
| [lupyariestaa/OceanEvolution](https://github.com/lupyariestaa/OceanEvolution) | 未声明 | 玩法接近且有在线演示，但没有 LICENSE，不能直接复用 |
| [NZLouislu/nzlouis-ai-games](https://github.com/NZLouislu/nzlouis-ai-games) | MIT | 是现代小游戏集合，但“小鱼”实现偏喂鱼动画，且 Next.js 对当前纯 SPA 场景偏重 |
| [wouterraateland/fishy](https://github.com/wouterraateland/fishy) | MIT | 玩法对口，但使用 React 15 / react-scripts 0.9，最后更新于 2017 年 |
| [yudinikita/dodging-fish](https://github.com/yudinikita/dodging-fish) | MIT | TypeScript + Vite + Phaser 结构可参考，但玩法是躲避，不是成长捕食 |

## 平台依据

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare React + Vite 指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Cloudflare GitHub Actions 指南](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
