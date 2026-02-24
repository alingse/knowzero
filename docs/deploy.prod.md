# KnowZero 生产环境部署文档

本文档描述如何将 KnowZero 部署到生产服务器。

## 目录

- [系统要求](#系统要求)
- [快速部署](#快速部署)
- [后端部署](#后端部署)
- [前端部署](#前端部署)
- [Nginx 配置](#nginx-配置)
- [Systemd 服务](#systemd-服务)
- [Docker 部署](#docker-部署)
- [监控与日志](#监控与日志)

---

## 系统要求

### 最低配置

| 组件 | 要求 |
|------|------|
| 操作系统 | Linux (Ubuntu 20.04+ / CentOS 8+) |
| Python | 3.11+ |
| Node.js | 20+ |
| 内存 | 2GB+ |
| 磁盘 | 10GB+ |

### 依赖服务

- **OpenAI API**: 需要有效的 API Key
- **数据库**: SQLite (默认) 或 PostgreSQL (可选)

---

## 快速部署

```bash
# 1. 克隆项目
git clone <your-repo-url> /opt/knowzero
cd /opt/knowzero

# 2. 安装后端依赖
cd backend
pip install -e .

# 3. 配置环境变量
cp .env.example .env
vim .env  # 编辑配置

# 4. 初始化数据库
alembic upgrade head

# 5. 安装前端依赖
cd ../frontend
pnpm install

# 6. 构建前端
pnpm build

# 7. 配置 Nginx（见下方）
# 8. 启动服务
systemctl start knowzero-backend
systemctl enable knowzero-backend
```

---

## 后端部署

### 1. 安装 Python 3.11+

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip
```

**CentOS/RHEL:**
```bash
sudo dnf install -y python3.11 python3.11-pip
```

### 2. 创建虚拟环境

```bash
cd /opt/knowzero/backend
python3.11 -m venv venv
source venv/bin/activate
```

### 3. 安装依赖

```bash
pip install -e .
```

**生产环境推荐安装:**
```bash
pip install -e ".[dev,gunicorn]"
```

### 4. 配置环境变量

创建 `/opt/knowzero/backend/.env`:

```bash
# 应用配置
ENV=production
DEBUG=false
SECRET_KEY=<your-secret-key-here>

# 服务器配置
HOST=0.0.0.0
PORT=8000
WORKERS=4

# 数据库（生产环境推荐 PostgreSQL）
# DATABASE_URL=postgresql+asyncpg://user:pass@localhost/knowzero
DATABASE_URL=sqlite+aiosqlite:////opt/knowzero/data/knowzero.db

# OpenAI 配置
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_API_BASE_URL=https://api.openai.com/v1  # 或使用代理
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7

# LangGraph 检查点目录
CHECKPOINT_DIR=/opt/knowzero/data/checkpoints
```

**生成 SECRET_KEY:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5. 创建数据目录

```bash
sudo mkdir -p /opt/knowzero/data
sudo chown -R $USER:$USER /opt/knowzero/data
```

### 6. 初始化数据库

```bash
cd /opt/knowzero/backend
source venv/bin/activate
alembic upgrade head
```

### 7. 使用 Gunicorn 运行

**开发环境 (单进程):**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**生产环境 (多进程):**
```bash
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile - \
  --log-level info
```

---

## 前端部署

### 1. 安装 Node.js 20+

**使用 NodeSource:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. 安装 pnpm

```bash
npm install -g pnpm
```

### 3. 安装依赖

```bash
cd /opt/knowzero/frontend
pnpm install --prod
```

### 4. 配置环境变量

创建 `/opt/knowzero/frontend/.env.production`:

```bash
# 生产环境 API 地址（通过 Nginx 代理）
VITE_API_URL=/api
```

**注意**: 生产环境中，API 和 WebSocket 通过 Nginx 代理到后端，前端无需配置完整 URL。

### 5. 构建前端

```bash
pnpm build
```

构建产物在 `frontend/dist/` 目录。

---

## Nginx 配置

### 1. 安装 Nginx

```bash
sudo apt install -y nginx
```

### 2. WebSocket 代理详解

#### WebSocket 连接原理

WebSocket 连接建立过程：

```
客户端                  Nginx                  后端
  |                       |                      |
  |--- WebSocket 握手 --->|--- WebSocket 握手 --->|
  |    (Upgrade: ws)      |    (Upgrade: ws)      |
  |                       |                      |
  |<-- 101 Switching -----|<-- 101 Switching -----|
  |      Protocol         |      Protocol         |
  |                       |                      |
  |<======= 双向通信流 ========|
```

**关键配置项说明：**

| 配置项 | 作用 | 必需性 |
|--------|------|--------|
| `proxy_http_version 1.1;` | 启用 HTTP/1.1（WebSocket 需要） | **必需** |
| `proxy_set_header Upgrade $http_upgrade;` | 传递协议升级头 | **必需** |
| `proxy_set_header Connection "upgrade";` | 设置连接升级 | **必需** |
| `proxy_read_timeout` | 读取超时（默认 60s） | **推荐** |
| `proxy_send_timeout` | 发送超时（默认 60s） | **推荐** |

#### 完整 WebSocket 配置

```nginx
# WebSocket 代理 - 完整配置
location /ws {
    # 后端地址
    proxy_pass http://127.0.0.1:8000;

    # WebSocket 必需配置
    proxy_http_version 1.1;                     # 必须：HTTP/1.1
    proxy_set_header Upgrade $http_upgrade;     # 必须：传递 Upgrade 头
    proxy_set_header Connection "upgrade";      # 必须：设置连接升级

    # 传递真实客户端信息
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # ==================== 禁用 Buffer（流式传输必需） ====================
    # 禁用缓冲，确保实时流式传输
    proxy_buffering off;                        # 关闭代理缓冲
    proxy_request_buffering off;                # 关闭请求缓冲
    proxy_cache off;                            # 关闭缓存

    # Buffer 相关设置（当 proxy_buffering off 时自动禁用）
    proxy_buffer_size 4k;                       # 缓冲区大小（禁用时无效）
    proxy_buffers 8 4k;                         # 缓冲区数量和大小（禁用时无效）
    proxy_busy_buffers_size 8k;                 # 忙碌缓冲区大小（禁用时无效）

    # ==================== 超时设置 ====================
    # WebSocket 长连接超时设置
    proxy_read_timeout 3600s;                   # 读取超时（1小时）
    proxy_send_timeout 3600s;                   # 发送超时（1小时）
    proxy_connect_timeout 60s;                  # 连接超时

    # ==================== WebSocket 特定优化 ====================
    # 保持连接活跃
    proxy_socket_keepalive on;                  # 启用 TCP keepalive

    # 禁用重定向（WebSocket 不支持）
    proxy_redirect off;
}
```

### 3. Buffer 和缓存配置详解

#### Buffer 配置说明

**什么是 Buffer？**

Buffer 是 Nginx 代理响应时的内存缓冲区，用于提高性能但对流式传输有延迟影响。

```nginx
# ==================== Buffer 配置对比 ====================

# 【方案 A】流式传输（AI 流式响应推荐）
location /api/stream {
    proxy_pass http://127.0.0.1:8000;
    proxy_buffering off;                        # 禁用缓冲，实时传输
    proxy_request_buffering off;                # 禁用请求缓冲
    proxy_cache off;                            # 禁用缓存
}

# 【方案 B】普通 API（可启用缓冲提高性能）
location /api {
    proxy_pass http://127.0.0.1:8000;
    proxy_buffering on;                         # 启用缓冲
    proxy_buffer_size 4k;                       # 头部缓冲区大小
    proxy_buffers 8 16k;                        # 8个16k的缓冲区
    proxy_busy_buffers_size 32k;                # 忙碌缓冲区大小
}
```

| 场景 | Buffer 推荐 | 说明 |
|------|-------------|------|
| 流式 AI 响应 | `off` | 实时传输，无延迟 |
| WebSocket | `off` | 长连接，即时通信 |
| 普通 JSON API | `on` | 提高性能，减少内存碎片 |
| 大文件下载 | `on` | 减少磁盘 I/O |

#### 禁用缓存的完整配置

```nginx
# ==================== 禁用所有缓存的 location 配置 ====================

# 方式一：完整配置
location /api/stream {
    proxy_pass http://127.0.0.1:8000;

    # 禁用缓冲
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;

    # 禁用响应缓存（浏览器端）
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";

    # 禁用 Nginx 本地缓存
    proxy_no_cache 1;
    proxy_cache_bypass 1;
}

# 方式二：简化配置（推荐）
location /api/stream {
    proxy_pass http://127.0.0.1:8000;
    proxy_buffering off;                        # 一行禁用所有缓冲
    add_header Cache-Control "no-cache";        # 禁用浏览器缓存
}
```

### 4. 完整站点配置

创建 `/etc/nginx/sites-available/knowzero`:

```nginx
# KnowZero Production Configuration
server {
    listen 80;
    server_name your-domain.com;  # 修改为你的域名

    # ==================== 全局设置 ====================
    client_max_body_size 10M;

    # ==================== 前端静态文件 ====================
    location / {
        root /opt/knowzero/frontend/dist;
        try_files $uri $uri/ /index.html;

        # 静态资源长期缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # ==================== 后端 API 代理（启用缓冲） ====================
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 普通 API 启用缓冲以提高性能
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 16k;

        # CORS 头（如需要）
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type, Authorization";
    }

    # ==================== 流式 API 代理（禁用缓冲） ====================
    location /api/stream {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 禁用缓冲以确保实时流式传输
        proxy_buffering off;
        proxy_request_buffering off;

        # 禁用缓存
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Expires "0";
    }

    # ==================== WebSocket 代理（禁用缓冲） ====================
    location /ws {
        proxy_pass http://127.0.0.1:8000;

        # WebSocket 必需配置
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 禁用缓冲（实时传输必需）
        proxy_buffering off;
        proxy_request_buffering off;

        # 长连接超时设置
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

    # WebSocket 不压缩（可能导致连接问题）
    gzip_disable "msie6";
}
```

### 5. 配置参数速查表

#### Buffer 相关

| 参数 | 默认值 | 推荐值（流式） | 推荐值（普通 API） |
|------|--------|----------------|-------------------|
| `proxy_buffering` | on | **off** | on |
| `proxy_request_buffering` | on | **off** | on |
| `proxy_buffer_size` | 4k/8k | - | 4k |
| `proxy_buffers` | 8 4k/8k | - | 8 16k |
| `proxy_busy_buffers_size` | - | - | 32k |

#### WebSocket 相关

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `proxy_http_version` | **1.1** | 必须设置 |
| `proxy_set_header Upgrade` | **$http_upgrade** | 必须设置 |
| `proxy_set_header Connection` | **"upgrade"** | 必须设置 |
| `proxy_read_timeout` | **3600s** | 防止长连接断开 |
| `proxy_send_timeout` | **3600s** | 防止长连接断开 |

#### 缓存相关

| 参数 | 作用 |
|------|------|
| `add_header Cache-Control "no-cache"` | 禁用浏览器缓存 |
| `proxy_cache off` | 禁用 Nginx 缓存 |
| `proxy_no_cache 1` | 强制不缓存 |

### 3. 启用站点

```bash
sudo ln -s /etc/nginx/sites-available/knowzero /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. 配置 HTTPS (可选)

使用 Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Systemd 服务

### 后端服务

创建 `/etc/systemd/system/knowzero-backend.service`:

```ini
[Unit]
Description=KnowZero Backend Service
After=network.target postgresql.service

[Service]
Type=notify
User=www-data
Group=www-data
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
ExecReload=/bin/kill -s HUP $MAINPID
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 创建日志目录

```bash
sudo mkdir -p /var/log/knowzero
sudo chown -R www-data:www-data /var/log/knowzero
```

### 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl start knowzero-backend
sudo systemctl enable knowzero-backend
sudo systemctl status knowzero-backend
```

### 常用命令

```bash
# 查看状态
sudo systemctl status knowzero-backend

# 重启服务
sudo systemctl restart knowzero-backend

# 查看日志
sudo journalctl -u knowzero-backend -f

# 重新加载配置
sudo systemctl daemon-reload
sudo systemctl restart knowzero-backend
```

---

## Docker 部署

### Docker Compose 配置

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: knowzero-backend
    restart: always
    ports:
      - "8000:8000"
    environment:
      - ENV=production
      - DATABASE_URL=postgresql+asyncpg://postgres:password@db:5432/knowzero
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=gpt-4o-mini
    volumes:
      - ./data/checkpoints:/app/checkpoints
    depends_on:
      - db

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: knowzero-frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - backend

  db:
    image: postgres:15-alpine
    container_name: knowzero-db
    restart: always
    environment:
      - POSTGRES_DB=knowzero
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
```

### 后端 Dockerfile

`backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

# 复制代码
COPY . .

# 创建数据目录
RUN mkdir -p checkpoints

# 暴露端口
EXPOSE 8000

# 启动服务
CMD ["gunicorn", "app.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### 前端 Dockerfile

`frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

# 构建
COPY . .
RUN pnpm build

# Nginx 镜像
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 启动 Docker 服务

```bash
docker-compose up -d
```

---

## 监控与日志

### 查看日志

**后端日志:**
```bash
# Systemd 日志
sudo journalctl -u knowzero-backend -f

# 应用日志
sudo tail -f /var/log/knowzero/error.log
```

**Nginx 日志:**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 健康检查

```bash
# 后端健康检查
curl http://localhost:8000/health

# 数据库连接检查
curl http://localhost:8000/api/health
```

### 性能监控（可选）

推荐使用:
- **Prometheus + Grafana**: 指标监控
- **Sentry**: 错误追踪
- **Uptime Kuma**: 服务可用性监控

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
sudo nginx -s reload
```

---

## 常见问题

### 1. WebSocket 连接失败

#### 症状
- 浏览器控制台显示 `WebSocket connection failed`
- 连接建立后立即断开
- 收到 `400 Bad Request` 或 `426 Upgrade Required`

#### 排查步骤

```bash
# 1. 检查 Nginx 配置语法
sudo nginx -t

# 2. 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 3. 测试后端 WebSocket 是否正常
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: localhost" \
  -H "Origin: http://localhost" \
  http://localhost:8000/ws/test

# 4. 检查防火墙
sudo ufw status
```

#### 常见原因与解决

| 问题 | 原因 | 解决方法 |
|------|------|----------|
| `426 Upgrade Required` | 缺少 Upgrade 头 | 检查 `proxy_set_header Upgrade $http_upgrade` |
| 连接 60 秒后断开 | 超时设置太短 | 增加 `proxy_read_timeout 3600s` |
| `upstream sent no valid HTTP/1.0 response` | 后端不支持 HTTP/1.1 | 检查后端配置，确保支持 WebSocket |
| 随机断线 | Buffer 导致 | 添加 `proxy_buffering off` |

#### 必需配置检查

```nginx
# 确保包含以下配置
location /ws {
    proxy_http_version 1.1;                     # ✓ 必需
    proxy_set_header Upgrade $http_upgrade;     # ✓ 必需
    proxy_set_header Connection "upgrade";      # ✓ 必需
    proxy_read_timeout 3600s;                   # ✓ 推荐
    proxy_buffering off;                        # ✓ 推荐
}
```

### 2. 流式响应有延迟/卡顿

#### 症状
- AI 回复不是逐字显示，而是一次性大段输出
- 流式输出有明显的延迟感
- WebSocket 连接正常但数据传输不流畅

#### 原因
Nginx 默认启用 `proxy_buffering`，会等待缓冲区满才发送数据。

#### 解决方法

```nginx
# 对于流式 API 或 WebSocket，禁用缓冲
location /api/stream {
    proxy_buffering off;                        # 关键
    proxy_request_buffering off;
}

location /ws {
    proxy_buffering off;                        # 关键
}
```

### 3. CORS 错误

**在 Nginx 中添加 CORS 头:**
```nginx
add_header Access-Control-Allow-Origin *;
add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
add_header Access-Control-Allow-Headers "Content-Type, Authorization";

# 处理 OPTIONS 预检请求
if ($request_method = 'OPTIONS') {
    return 204;
}
```

### 4. 数据库迁移失败

**检查数据库连接:**
```bash
# 测试连接
python -c "from app.core.database import engine; import asyncio; asyncio.run(engine.connect())"
```

### 5. 内存不足

**减少 Gunicorn workers:**
```ini
# 在 systemd 服务中修改
ExecStart=... --workers 2 ...
```

### 6. OpenAI API 请求超时

**配置代理或增加超时:**
```bash
# .env 中配置
OPENAI_API_BASE_URL=https://your-proxy.com/v1
```

### 7. 前端 WebSocket 连接地址问题

#### 问题现象
```
WebSocket connection to 'ws://localhost:8000/ws/xxx' failed
```

#### 原因
前端直接连接后端端口，但在生产环境应该通过 Nginx 代理。

#### 解决方法

**前端代码中不要硬编码完整 URL：**

```typescript
// ❌ 错误：硬编码后端地址
const ws = new WebSocket('ws://localhost:8000/ws/' + sessionId);

// ✅ 正确：使用相对路径，通过 Nginx 代理
const ws = new WebSocket('/ws/' + sessionId);

// ✅ 或者动态获取协议
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${sessionId}`);
```

### 8. HTTPS 下 WebSocket 连接失败

#### 症状
```
WebSocket connection to 'ws://domain.com/ws/xxx' failed: WebSocket opening handshake was canceled
```

#### 原因
HTTPS 页面必须使用 WSS (WebSocket Secure)，不能使用 WS。

#### 解决方法

```javascript
// 根据当前协议自动选择
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${sessionId}`);
```

### 9. Nginx 配置验证与调试

```bash
# 检查配置语法
sudo nginx -t

# 重载配置
sudo nginx -s reload

# 查看访问日志（实时）
sudo tail -f /var/log/nginx/access.log

# 查看 WebSocket 升级日志
sudo grep "Upgrade" /var/log/nginx/access.log

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 查看 Nginx 进程
ps aux | grep nginx

# 查看 Nginx 监听端口
sudo netstat -tlnp | grep nginx
# 或
sudo ss -tlnp | grep nginx
```

---

## 安全建议

1. **使用 HTTPS**: 在生产环境始终启用 SSL/TLS
2. **限制 CORS**: 将 `Access-Control-Allow-Origin` 改为具体域名
3. **定期更新**: 保持系统和依赖包最新
4. **防火墙**: 只开放必要端口 (80, 443)
5. **备份**: 定期备份数据库和检查点目录
6. **密钥管理**: 使用环境变量或密钥管理服务存储敏感信息

---

## 联系支持

如有部署问题，请联系技术支持或提交 Issue。
