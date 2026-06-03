# @d2bp/front

React 前端，调用 `/api` 接口显示阵容推荐结果。

## 开发

```bash
pnpm install
pnpm --filter @d2bp/api dev # 启动 API
pnpm --filter @d2bp/front dev # 启动前端
```

开发模式下，Vite 会通过代理把 `/api/*` 请求转发到本地 Fastify 服务。
