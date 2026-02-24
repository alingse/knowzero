# KnowZero 后端/前端部署详解

## 部署架构

```
                    ┌─────────────┐
                    │    Nginx    │
                    │   :80/:443  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  Frontend   │ │     API     │ │  WebSocket  │
    │  serve:5173 │ │ uvicorn:8000│ │ uvicorn:8000│
    └─────────────┘ └─────────────┘ └─────────────┘
```

- **前端**: `serve` 服务静态文件，端口 5173
- **后端**: `uvicorn` 服务 API，端口 8000
- **Nginx**: 反向代理 + SSL

---

## 后端部署

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ENV` | 环境 | `production` |
| `SECRET_KEY` | 密钥 | 自动生成 |
| `DATABASE_URL` | 数据库 | `sqlite+aiosqlite:////opt/knowzero/data/knowzero.db` |
| `OPENAI_API_KEY` | OpenAI 密钥 | **必需** |
| `OPENAI_MODEL` | 模型 | `gpt-4o-mini` |
| `CHECKPOINT_DIR` | 检查点目录 | `/opt/knowzero/data/checkpoints` |

### 后端路由

| 路径 | 说明 |
|------|------|
| `/api/sessions` | 会话管理 |
| `/api/documents` | 文档管理 |
| `/api/entities` | 实体管理 |
| `/api/roadmaps` | 路线图管理 |
| `/ws` | WebSocket（流式响应） |
| `/health` | 健康检查 |

### 使用 Gunicorn（生产环境推荐）

```ini
[Unit]
Description=KnowZero Backend
After=network.target

[Service]
Type=notify
User=www-data
WorkingDirectory=/opt/knowzero/backend
Environment="PATH=/opt/knowzero/backend/venv/bin"
EnvironmentFile=/opt/knowzero/backend/.env
ExecStart=/opt/knowzero/backend/venv/bin/gunicorn \
    app.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --access-logfile /var/log/knowzero/access.log \
    --error-logfile /var/log/knowzero/error.log \
    --log-level info
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 前端部署

### 构建配置

```bash
cd frontend

# 生产环境构建
pnpm build
```

构建产物在 `dist/` 目录。

### 环境变量

**`.env.production`**（可选）:
```bash
VITE_API_URL=/api
```

生产环境通常使用相对路径，由 Nginx 代理到后端。

### Serve 命令

```bash
# 全局安装
npm install -g serve

# 基本用法
serve -s dist -l 5173

# 带缓存头
serve -s dist -l 5173 --no-clipboard
```

### Serve 参数

| 参数 | 说明 |
|------|------|
| `-s` | 单页应用模式 |
| `-l` | 监听端口 |
| `--no-clipboard` | 不复制地址到剪贴板 |

---

## Nginx 完整配置

```nginx
# /etc/nginx/sites-available/knowzero
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 10M;

    # ==================== 前端 (serve:5173) ====================
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SPA 路由支持
        proxy_http_version 1.1;
    }

    # ==================== 后端 API (uvicorn:8000) ====================
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 启用缓冲提高性能
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 16k;
    }

    # ==================== WebSocket (流式 AI 响应) ====================
    location /ws {
        proxy_pass http://127.0.0.1:8000;

        # WebSocket 必需
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 禁用缓冲（实时传输）
        proxy_buffering off;

        # 长连接超时
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # ==================== Gzip 压缩 ====================
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/rss+xml font/truetype font/opentype
               application/vnd.ms-fontobject image/svg+xml;
}
```

### Nginx 配置参数说明

#### WebSocket 必需配置

| 配置 | 说明 |
|------|------|
| `proxy_http_version 1.1;` | HTTP/1.1（WebSocket 必需） |
| `proxy_set_header Upgrade $http_upgrade;` | 传递 Upgrade 头 |
| `proxy_set_header Connection "upgrade";` | 连接升级 |
| `proxy_buffering off;` | 禁用缓冲，实时传输 |
| `proxy_read_timeout 3600s;` | 长连接超时 |

#### Buffer 配置对比

| 场景 | `proxy_buffering` | 说明 |
|------|-------------------|------|
| WebSocket | `off` | 实时传输 |
| 普通 API | `on` | 提高性能 |

---

## 更新部署

### 后端更新

```bash
cd /opt/knowzero
git pull
cd backend
source venv/bin/activate
pip install -e .
alembic upgrade head
sudo systemctl restart knowzero-backend
```

### 前端更新

```bash
cd /opt/knowzero/frontend
git pull
pnpm install
pnpm build
sudo systemctl restart knowzero-frontend
```

---

## 常见问题

### WebSocket 连接失败

**症状**: `WebSocket connection failed`

**解决**: 确保以下配置存在：
```nginx
location /ws {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

### 流式响应有延迟

**原因**: Buffer 导致

**解决**: `/ws` 路由添加 `proxy_buffering off;`

### 前端刷新 404

**原因**: SPA 路由需要回退

**解决**: serve 默认支持 SPA 模式（`-s` 参数）

### HTTPS 下 WebSocket 失败

**解决**: 前端自动使用 `wss://`，无需修改：
```typescript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;
```

---

## 日志查看

```bash
# 后端日志
sudo journalctl -u knowzero-backend -f

# 前端日志
sudo journalctl -u knowzero-frontend -f

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```
