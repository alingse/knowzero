# KnowZero 部署文档

## 目录

- [开发环境启动](#开发环境启动)
- [环境变量配置](#环境变量配置)
- [生产环境部署](#生产环境部署)

---

## 开发环境启动

### 后端

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8002
```

后端 API 将运行在 `http://localhost:8002`

### 前端

```bash
cd frontend
npm install          # 首次运行安装依赖
npm run dev          # 启动开发服务器
```

前端将运行在 `http://localhost:5173`

---

## 环境变量配置

### 前端环境变量

前端通过 `.env` 文件配置 API 地址：

```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8002/api
```

**环境变量说明：**

| 变量 | 说明 | 开发环境默认值 | 生产环境建议 |
|------|------|---------------|-------------|
| `VITE_API_URL` | API 基础路径 | `/api` (通过 Vite proxy) | `/api` (通过 nginx 代理) |

**注意：** `.env.local` 文件不应提交到 git，已在 `.gitignore` 中排除。

### 前端环境变量文件优先级

1. `.env.local` - 本地覆盖（优先级最高，不提交）
2. `.env.development` - 开发环境
3. `.env.production` - 生产环境
4. `.env` - 默认配置

---

## 生产环境部署

### 架构图

```
                    ┌─────────────┐
                    │    Nginx    │
                    │   :80/:443  │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
    ┌─────────────────┐       ┌─────────────────┐
    │  Frontend (SPA) │       │   Backend API   │
    │  /var/www/...   │       │   :8002         │
    └─────────────────┘       └─────────────────┘
              ▲                         │
              │                         │
        Static Files              API Requests
```

### 1. 构建前端

```bash
cd frontend
npm run build
# 构建产物在 frontend/dist/
```

### 2. Nginx 配置

创建 nginx 配置文件 `/etc/nginx/sites-available/knowzero`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/knowzero/frontend/dist;
        try_files $uri $uri/ /index.html;

        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理到后端
    location /api {
        proxy_pass http://localhost:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持（如果需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/knowzero /etc/nginx/sites-enabled/
sudo nginx -t          # 测试配置
sudo systemctl reload nginx
```

### 3. 部署静态文件

```bash
# 创建目录
sudo mkdir -p /var/www/knowzero/frontend

# 复制构建产物
sudo cp -r frontend/dist /var/www/knowzero/frontend/

# 设置权限
sudo chown -R www-data:www-data /var/www/knowzero
```

### 4. 后端服务（使用 systemd）

创建服务文件 `/etc/systemd/system/knowzero.service`：

```ini
[Unit]
Description=KnowZero Backend API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/knowzero/backend
Environment="PATH=/var/www/knowzero/backend/.venv/bin"
ExecStart=/var/www/knowzero/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8002
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable knowzero
sudo systemctl start knowzero
sudo systemctl status knowzero
```

---

## HTTPS 配置（可选）

使用 Let's Encrypt 免费证书：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 故障排查

### 检查后端服务

```bash
sudo systemctl status knowzero
journalctl -u knowzero -f
```

### 检查 Nginx 日志

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 检查端口占用

```bash
sudo lsof -i :8002
sudo lsof -i :80
```
