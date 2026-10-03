# LeebertyCR 服务端版（仅引擎 + 备用网页界面）
#
# 本镜像只包含 Node 引擎与网页界面；原生桌面窗口（LeebertyCR.exe）在 Windows 客户端运行，
# 通过浏览器或本机客户端访问容器暴露的 8816 端口。
#
# 构建：docker build -t leebertycr:1.0.0 .
# 运行：docker run -d --name leebertycr -p 8816:8816 -v leebertycr-data:/app/data leebertycr:1.0.0

FROM node:22-alpine

LABEL org.opencontainers.image.title="LeebertyCR" \
      org.opencontainers.image.description="CRA/CRC 临床试验工作台（本地引擎 + 备用网页界面）" \
      org.opencontainers.image.version="1.0.0"

WORKDIR /app

# 零第三方依赖：只需拷贝源码、知识库与网页界面
COPY package.json ./
COPY src ./src
COPY seed ./seed
COPY web ./web
COPY scripts ./scripts

# 运行数据目录（建议挂载卷持久化）
RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV CRA_PORT=8816 \
    CRA_HOST=0.0.0.0 \
    CRA_DATA_DIR=/app/data \
    CRA_BUILTIN_ACCOUNTS=1 \
    NODE_ENV=production

EXPOSE 8816

# 健康检查：应用身份必须是 LeebertyCR（避免误判其他服务的 8816）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.CRA_PORT||8816)+'/api/health').then(r=>r.json()).then(h=>process.exit(h&&h.app==='LeebertyCR'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]