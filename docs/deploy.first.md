# KnowZero 快速部署

首次部署 KnowZero 到生产服务器的快速指南。

## 前置要求

| 组件 | 要求 |
|------|------|
| 服务器 | Linux (Ubuntu 20.04+ / CentOS 8+) |
| Python | 3.11+ |
| Node.js | 20+ |
| 内存 | 2GB+ |

---

## 1. 后端部署

```bash
# 安装 Python 3.11
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip

# 克隆项目
git clone <your-repo-url> /opt/knowzero
cd /opt/knowzero/backend

# 创建虚拟环境并安装依赖
python3.11 -m venv venv
source venv/bin/activate
pip install -e .

# 配置环境变量
cat > .env << 'EOF'
ENV=production
SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
DATABASE_URL=sqlite+aiosqlite:////opt/knowzero/data/knowzero.db
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4o-mini
CHECKPOINT_DIR=/opt/knowzero/data/checkpoints
EOF

# 创建数据目录
sudo mkdir -p /opt/knowzero/data
sudo chown -R $USER:$USER /opt/knowzero/data

# 初始化数据库
alembic upgrade head

# 测试运行
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 2. 前端部署

```bash
cd /opt/knowzero/frontend

# 安装 pnpm（如未安装）
npm install -g pnpm

# 安装依赖并构建
pnpm install
pnpm build

# 安装 serve（用于生产环境服务静态文件）
npm install -g serve

# 测试运行前端（端口 5173）
serve -s dist -l 5173
```

---

## 3. Nginx 配置

创建 `/etc/nginx/sites-available/knowzero`：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 修改为你的域名

    # 前端（serve 在 5173 端口）
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 后端 API（uvicorn 在 8000 端口）
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket（流式 AI 响应）
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/knowzero /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Systemd 服务

**后端服务** `/etc/systemd/system/knowzero-backend.service`：

```ini
[Unit]
Description=KnowZero Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/knowzero/backend
Environment="PATH=/opt/knowzero/backend/venv/bin"
ExecStart=/opt/knowzero/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**前端服务** `/etc/systemd/system/knowzero-frontend.service`：

```ini
[Unit]
Description=KnowZero Frontend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/knowzero/frontend/dist
Environment="PATH=/opt/knowzero/frontend/node_modules/.bin:/usr/bin"
ExecStart=serve -s . -l 5173
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable knowzero-backend knowzero-frontend
sudo systemctl start knowzero-backend knowzero-frontend

# 检查状态
sudo systemctl status knowzero-backend
sudo systemctl status knowzero-frontend
```

---

## 5. HTTPS（可选）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 故障排查

```bash
# 查看后端日志
sudo journalctl -u knowzero-backend -f

# 查看前端日志
sudo journalctl -u knowzero-frontend -f

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/error.log

# 检查端口
sudo lsof -i :8000
sudo lsof -i :5173
```
