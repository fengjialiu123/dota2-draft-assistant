# @d2bp/api

Fastify 服务，提供英雄数据与阵容推荐接口。

## 开发

```bash
pnpm install
pnpm --filter @d2bp/api dev
```

默认监听 `http://localhost:3000`，对外暴露：

- `GET /health`：服务存活检查
- `GET /heroes`：返回预置英雄列表
- `POST /recommend`：根据请求体生成推荐
