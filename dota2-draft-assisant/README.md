# Dota 2 Draft Assistant

该仓库包含一个基于 Fastify + React 的 Dota 2 BP 推荐工具。

## 包结构

- `packages/shared`：共享数据和推荐引擎逻辑
- `apps/api`：Fastify API 服务，提供英雄列表与推荐接口
- `apps/front`：React 前端，调用 API 展示推荐结果

## 开发

```bash
pnpm install
pnpm --filter @d2bp/api dev   # 启动 API 服务
pnpm --filter @d2bp/front dev # 启动前端
```

默认 API 端口 3000，前端通过 Vite 代理 `/api` 请求到该服务。
