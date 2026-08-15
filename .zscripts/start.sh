#!/bin/sh

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# 存储所有子进程的 PID
pids=""

# 清理函数：优雅关闭所有服务
cleanup() {
    echo ""
    echo "🛑 正在关闭所有服务..."
    
    # 发送 SIGTERM 信号给所有子进程
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "   关闭进程 $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done
    
    # 等待所有进程退出（最多等待 5 秒）
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            # 如果还在运行，等待最多 4 秒
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            # 如果仍然在运行，强制关闭
            if kill -0 "$pid" 2>/dev/null; then
                echo "   强制关闭进程 $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done
    
    echo "✅ 所有服务已关闭"
    exit 0
}

echo "🚀 开始启动所有服务..."
echo ""

# 切换到构建目录
cd "$BUILD_DIR" || exit 1

ls -lah

# 启动静态文件服务器（output: "export" 不产生 next-service-dist/server.js；build.sh 把 out/ 复制到了 next-service-dist/public/）
STATIC_ROOT="./next-service-dist/public"
if [ -f "$STATIC_ROOT/index.html" ]; then
    echo "🚀 启动静态文件服务器..."
    PORT="${PORT:-3000}"
    HOSTNAME="${HOSTNAME:-0.0.0.0}"
    STATIC_ROOT="$STATIC_ROOT" PORT="$PORT" HOSTNAME="$HOSTNAME" bun << SRV_EOF &
        const ct = {
            ".html":"text/html; charset=utf-8", ".htm":"text/html; charset=utf-8",
            ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8",
            ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
            ".map":"application/json; charset=utf-8", ".svg":"image/svg+xml",
            ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
            ".webp":"image/webp", ".avif":"image/avif", ".gif":"image/gif",
            ".ico":"image/x-icon", ".woff":"font/woff", ".woff2":"font/woff2",
            ".txt":"text/plain; charset=utf-8", ".xml":"application/xml; charset=utf-8",
            ".webmanifest":"application/manifest+json; charset=utf-8"
        };
        const { resolve, extname, join } = require("node:path");
        const { existsSync } = require("node:fs");
        const root = resolve(process.env.STATIC_ROOT ?? "./next-service-dist/public");
        const port = Number(process.env.PORT ?? "3000");
        const hostname = process.env.HOSTNAME ?? "0.0.0.0";
        const inRoot = (p) => (p === root || p.startsWith(root + "/")) && existsSync(p);
        const reply = (p) => inRoot(p) ? new Response(Bun.file(p), {
            headers: { "Content-Type": ct[extname(p).toLowerCase()] ?? "application/octet-stream" }
        }) : null;
        Bun.serve({
            port, hostname,
            fetch(req) {
                let rel;
                try { rel = decodeURIComponent(new URL(req.url).pathname); } catch {
                    return new Response("Bad Request", { status: 400 });
                }
                if (rel.includes("\0")) return new Response("Bad Request", { status: 400 });
                if (rel !== "/" && rel.endsWith("/"))
                    return new Response(null, { status: 308, headers: { Location: rel.replace(/\/+$/, "") } });
                rel = rel.replace(/^\/+/, "");
                if (rel === "") return reply(join(root, "index.html")) ?? new Response("Not Found", { status: 404 });
                for (const cand of [join(root, rel), join(root, rel + ".html"), join(root, rel, "index.html")]) {
                    const r = reply(cand);
                    if (r) return r;
                }
                return reply(join(root, "404.html")) ?? new Response("Not Found", { status: 404 });
            }
        });
        console.log("[artcovr] serving " + root + " at http://" + hostname + ":" + port);
SRV_EOF
    NEXT_PID=$!
    pids="$NEXT_PID"

    sleep 1
    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
        echo "❌ 静态文件服务器启动失败"
        exit 1
    else
        echo "✅ 静态文件服务器已启动 (PID: $NEXT_PID, Port: $PORT, serving $STATIC_ROOT)"
    fi
else
    echo "⚠️  未找到静态导出站点: $STATIC_ROOT/index.html"
    echo "    run .zscripts/build.sh (it copies out/ to next-service-dist/public/)"
fi

# 启动 mini-services
if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 启动 mini-services..."
    
    # 运行启动脚本（从根目录运行，脚本内部会处理 mini-services-dist 目录）
    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"
    
    # 等待一小段时间检查进程是否成功启动
    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  mini-services 可能启动失败，但继续运行..."
    else
        echo "✅ mini-services 已启动 (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  未找到 mini-services 启动脚本，但目录存在"
else
    echo "ℹ️  mini-services 目录不存在，跳过"
fi

# ARTCOVR does not expose the legacy arbitrary-port Caddy proxy. Keep the
# launcher alive as PID 1 and forward shutdown to the app processes above.
if [ -z "$pids" ]; then
    echo "❌ 未启动任何 ARTCOVR 服务"
    exit 1
fi
trap cleanup INT TERM
echo "🎉 ARTCOVR 服务已启动"
wait
