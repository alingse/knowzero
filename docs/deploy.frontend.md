# KnowZero 前端部署文档

本文档详细说明 KnowZero 前端的生产环境部署步骤。

---

## 目录

- [部署架构](#部署架构)
- [准备工作](#准备工作)
- [构建前端](#构建前端)
- [部署到服务器](#部署到服务器)
- [Nginx 配置](#nginx-配置)
- [环境变量说明](#环境变量说明)
- [前端配置原理](#前端配置原理)
- [常见问题](#常见问题)

---

## 部署架构

```
                    ┌─────────────────┐
                    │     用户浏览器    │
                    └────────┬─────────┘
                             │ HTTP/HTTPS
                    ┌────────▼─────────┐
                    │     Nginx        │
                    │  (静态文件服务)   │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐        ┌──────────┐        ┌──────────┐
   │  前端    │        │   API    │        │   WS     │
   │ 静态文件 │        │  代理    │        │  代理    │
   │  /dist  │        │  /api    │        │   /ws    │
   └─────────┘        └────┬─────┘        └────┬─────┘
                            │                   │
                            └─────────┬─────────┘
                                      │
                               ┌──────▼──────┐
                               │  后端服务    │
                               │  :8000      │
                               └─────────────┘
```

**关键点**：
- 前端是静态文件，由 Nginx 直接提供服务
- API 和 WebSocket 请求通过 Nginx 代理到后端
- 前端使用**相对路径**，无需配置具体域名

---

## 准备工作

### 1. 检查构建环境

```bash
# 检查 Node.js 版本（需要 20+）
node --version

# 检查 pnpm 版本
pnpm --version
```

### 2. 安装 pnpm（如未安装）

```bash
npm install -g pnpm
```

---

## 构建前端

### 本地构建

```bash
# 进入前端目录
cd frontend

# 安装依赖
pnpm install

# 生产环境构建
pnpm build
```

**构建产物位置**: `frontend/dist/`

### 构建输出说明

```
dist/
├── index.html              # 入口 HTML
├── assets/
│   ├── index-[hash].js     # 打包后的 JavaScript
│   ├── index-[hash].css    # 打包后的 CSS
│   ├── logo-[hash].png     # 图片等静态资源
│   └── ...
└── vite.svg
```

---

## 部署到服务器

### 方案一：直接部署到服务器

```bash
# 1. 在服务器上创建部署目录
sudo mkdir -p /var/www/knowzero
sudo chown -R $USER:$USER /var/www/knowzero

# 2. 上传构建产物到服务器
# 方式 A: 使用 scp
scp -r frontend/dist/* user@server:/var/www/knowzero/

# 方式 B: 使用 rsync（推荐，支持增量同步）
rsync -avz --delete frontend/dist/ user@server:/var/www/knowzero/

# 3. 设置权限
sudo chown -R www-data:www-data /var/www/knowzero
sudo chmod -R 755 /var/www/knowzero
```

### 方案二：在服务器上构建

```bash
# 1. 克隆代码到服务器
git clone <your-repo-url> /opt/knowzero
cd /opt/knowzero/frontend

# 2. 安装依赖并构建
pnpm install
pnpm build

# 3. 部署到 web 目录
sudo cp -r dist/* /var/www/knowzero/
sudo chown -R www-data:www-data /var/www/knowzero
```

### 方案三：CI/CD 自动部署

**GitHub Actions 示例**：

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        working-directory: ./frontend
        run: pnpm install

      - name: Build
        working-directory: ./frontend
        run: pnpm build

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            rm -rf /var/www/knowzero/*
            exit
      - name: Copy files
        uses: burnett01/rsync-deployments@5.2.3
        with:
          switches: -avzr --delete
          path: frontend/dist/
          remote_path: /var/www/knowzero/
          remote_host: ${{ secrets.SERVER_HOST }}
          remote_user: ${{ secrets.SERVER_USER }}
          remote_key: ${{ secrets.SSH_KEY }}
```

---

## Nginx 配置

### 完整配置文件

创建 `/etc/nginx/sites-available/knowzero`：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 修改为你的域名

    # ==================== 前端静态文件 ====================
    location / {
        alias /var/www/knowzero/;           # 前端构建产物目录
        try_files $uri $uri/ /index.html;   # SPA 路由回退

        # 静态资源长期缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # HTML 不缓存
        location = /index.html {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }
    }

    # ==================== API 代理 ====================
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ==================== WebSocket 代理 ====================
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 禁用缓冲
        proxy_buffering off;

        # 长连接超时
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss;
}
```

### 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/knowzero /etc/nginx/sites-enabled/

# 检查配置语法
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## 环境变量说明

### 构建时环境变量

前端在**构建时**读取环境变量，通过 Vite 的 `import.meta.env` 注入。

**`.env.production`**（可选）:

```bash
# API 地址（生产环境通常使用相对路径）
VITE_API_URL=/api
```

**重要**: 环境变量必须以 `VITE_` 开头才能在客户端代码中使用。

### 环境变量对比

| 环境 | `VITE_API_URL` | 实际请求地址 |
|------|----------------|--------------|
| 开发 | `http://localhost:8002` | `http://localhost:8002/api/sessions` |
| 生产（推荐）| `/api` 或不设置 | `//your-domain.com/api/sessions` |
| 生产（绝对路径）| `https://api.domain.com` | `https://api.domain.com/api/sessions` |

---

## 前端配置原理

### API 请求配置

**源码** (`frontend/src/api/client.ts`):

```typescript
const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    // ...
  });
}
```

**工作原理**:
1. `import.meta.env.VITE_API_URL` 是构建时注入的值
2. 未设置时默认为 `/api`（相对路径）
3. 使用相对路径时，浏览器自动补全为当前域名

### WebSocket 连接配置

**源码** (`frontend/src/api/websocket.ts`):

```typescript
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;
const ws = new WebSocket(wsUrl);
```

**工作原理**:
1. 自动检测页面协议（HTTP → WS，HTTPS → WSS）
2. 使用 `window.location.host` 获取当前域名和端口
3. 动态构建 WebSocket URL

**示例**:
| 页面地址 | WebSocket URL |
|----------|---------------|
| `http://domain.com` | `ws://domain.com/ws/xxx` |
| `https://domain.com` | `wss://domain.com/ws/xxx` |
| `http://localhost:3000` | `ws://localhost:3000/ws/xxx` |

---

## 部署检查清单

- [ ] 前端已成功构建（`pnpm build` 无错误）
- [ ] 构建产物已上传到服务器 `/var/www/knowzero/`
- [ ] 目录权限正确（`www-data:www-data`）
- [ ] Nginx 配置已创建并启用
- [ ] `nginx -t` 检查通过
- [ ] 后端服务正在运行（`systemctl status knowzero-backend`）
- [ ] 可以访问首页（`curl http://your-domain.com`）
- [ ] API 请求正常（浏览器控制台无 404 错误）
- [ ] WebSocket 连接正常（无连接失败错误）

---

## 常见问题

### 1. 页面空白，浏览器控制台报错

**症状**: 访问域名后页面空白，控制台显示资源 404

**排查**:
```bash
# 检查文件是否存在
ls -la /var/www/knowzero/

# 检查 Nginx 配置中的 alias 路径
grep "alias" /etc/nginx/sites-available/knowzero

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log
```

**解决**: 确保 Nginx 配置的 `alias` 路径与实际部署路径一致。

### 2. 刷新页面 404

**症状**: 首页正常，但刷新子页面（如 `/session/123`）显示 404

**原因**: SPA 路由需要服务器回退到 `index.html`

**解决**: 确保配置了 `try_files`:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### 3. API 请求 404 或 CORS 错误

**症状**: 浏览器控制台显示 `/api/xxx` 404 或 CORS 错误

**排查**:
```bash
# 检查后端是否运行
curl http://localhost:8000/health

# 检查 Nginx 代理配置
curl http://your-domain.com/api/health
```

**解决**: 确保 Nginx 配置了 `/api` 代理到后端。

### 4. WebSocket 连接失败

**症状**: 浏览器控制台显示 `WebSocket connection failed`

**原因**: HTTPS 页面使用 `ws://` 被浏览器阻止

**解决**: 前端代码已自动处理（根据协议选择 `ws://` 或 `wss://`），确保：
- Nginx 配置了 `/ws` 代理
- 配置了正确的 `Upgrade` 头

### 5. 构建后 API 地址不对

**症状**: 构建后前端请求错误的 API 地址

**原因**: 构建时使用了错误的环境变量

**解决**:
```bash
# 生产环境不设置或设置为相对路径
echo "VITE_API_URL=/api" > frontend/.env.production
pnpm build
```

### 6. 静态资源缓存问题

**症状**: 更新后用户看不到新版本

**解决**: 确保配置了正确的缓存策略:
```nginx
# 带哈希的静态资源长期缓存
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# HTML 不缓存
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

---

## 一键部署脚本

保存为 `deploy-frontend.sh`:

```bash
#!/bin/bash
set -e

SERVER_USER="user"              # 修改为你的服务器用户
SERVER_HOST="your-domain.com"   # 修改为你的服务器地址
DEPLOY_PATH="/var/www/knowzero"

echo "🔨 构建前端..."
cd frontend
pnpm install
pnpm build

echo "📤 上传到服务器..."
rsync -avz --delete dist/ ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/

echo "🔧 设置权限..."
ssh ${SERVER_USER}@${SERVER_HOST} "sudo chown -R www-data:www-data ${DEPLOY_PATH}"

echo "✅ 部署完成！"
echo "🌐 访问: http://${SERVER_HOST}"
```

使用:
```bash
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

---

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建
cd frontend
pnpm install
pnpm build

# 部署
rsync -avz --delete dist/ user@server:/var/www/knowzero/
```
