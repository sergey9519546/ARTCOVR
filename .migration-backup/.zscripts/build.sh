#!/bin/bash

# 将 stderr 重定向到 stdout，避免 execute_command 因为 stderr 输出而报错
exec 2>&1

set -euo pipefail

# 获取脚本所在目录（.zscripts 目录，即 workspace-agent/.zscripts）
# 使用 $0 获取脚本路径（兼容 sh 和 bash）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Next.js 项目路径（.zscripts 的上级目录，即本仓库根目录）
# 从 SCRIPT_DIR 推导，避免写死其他机器上的绝对路径。
NEXTJS_PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 检查 Next.js 项目目录是否存在
if [ ! -d "$NEXTJS_PROJECT_DIR" ]; then
    echo "❌ 错误: Next.js 项目目录不存在: $NEXTJS_PROJECT_DIR"
    exit 1
fi

echo "🚀 开始构建 Next.js 应用和 mini-services..."
echo "📁 Next.js 项目路径: $NEXTJS_PROJECT_DIR"

# 切换到 Next.js 项目目录
cd "$NEXTJS_PROJECT_DIR" || exit 1

# 设置环境变量
export NEXT_TELEMETRY_DISABLED=1

case "${BUILD_ID:-}" in
    ""|*[!A-Za-z0-9._-]*)
        echo "❌ BUILD_ID must be a non-empty safe identifier."
        exit 1
        ;;
esac

BUILD_DIR="/tmp/build_fullstack_${BUILD_ID}"
case "$BUILD_DIR" in
    /tmp/build_fullstack_*) ;;
    *) echo "❌ Refusing unsafe build directory: $BUILD_DIR"; exit 1 ;;
esac
PACKAGE_FILE="${BUILD_DIR}.tar.gz"
cleanup_build_dir() {
    case "$BUILD_DIR" in
        /tmp/build_fullstack_*) rm -rf -- "$BUILD_DIR" ;;
    esac
}
trap cleanup_build_dir EXIT
echo "📁 清理并创建构建目录: $BUILD_DIR"
cleanup_build_dir
rm -f -- "$PACKAGE_FILE"
mkdir -p "$BUILD_DIR"

# 安装依赖
echo "📦 安装依赖..."
bun install --frozen-lockfile

# Run deterministic release gates before packaging. Empty public catalogs are
# allowed for private review builds, but the projection must match the approval
# artifact and all contracts must remain green.
echo "🔎 验证目录投影和应用契约..."
bun run catalog:project:check
bun run test
bun run typecheck
bun run lint

# 构建 Next.js 应用
echo "🔨 构建 Next.js 应用..."
bun run build

# Deployment builds validate source configuration; they never rewrite source
# files or silently change the selected Next.js output mode. next.config.ts
# selects output: "export", which emits a static site under out/ and can never
# produce a standalone server bundle, so the gate verifies the artifact that
# mode actually writes.
if [ ! -s "next-build/index.html" ]; then
    echo "❌ 构建未产出非空的 out/index.html。请确认 next.config 中的 output: \"export\" 配置。"
    exit 1
fi

# 构建 mini-services
# 检查 Next.js 项目目录下是否有 mini-services 目录
if [ -d "$NEXTJS_PROJECT_DIR/mini-services" ]; then
    echo "🔨 构建 mini-services..."
    # 使用 workspace-agent 目录下的 mini-services 脚本
    sh "$SCRIPT_DIR/mini-services-install.sh"
    sh "$SCRIPT_DIR/mini-services-build.sh"

    # 复制 mini-services-start.sh 到 mini-services-dist 目录
    echo "  - 复制 mini-services-start.sh 到 $BUILD_DIR"
    cp "$SCRIPT_DIR/mini-services-start.sh" "$BUILD_DIR/mini-services-start.sh"
    chmod +x "$BUILD_DIR/mini-services-start.sh"
else
    echo "ℹ️  mini-services 目录不存在，跳过"
fi

# 将所有构建产物复制到临时构建目录
echo "📦 收集构建产物到 $BUILD_DIR..."

# output: "export" 的唯一产物是 out/ 静态站点根目录。它已经包含了旧流程分别
# 复制的三份内容：public/ 的全部文件位于 out/ 根目录，.next/static 位于
# out/_next/static，而 .next/standalone 在导出模式下根本不会生成。因此这里只
# 复制 out/，替代原来的三个分支拷贝。
# 落点保持为 next-service-dist/public，这样下面的部署期修剪路径不变。
echo "  - 复制 out（静态导出站点根目录）"
mkdir -p "$BUILD_DIR/next-service-dist/public"
cp -r next-build/. "$BUILD_DIR/next-service-dist/public/"

if [ "${NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING:-0}" != "1" ]; then
    echo "🧹 从公共包中移除未批准的审核图像..."
    bun run catalog:prune:deployment -- "$BUILD_DIR/next-service-dist/public"
else
    echo "ℹ️  私有审核构建保留审核图像；此包必须部署到访问受控的 Sites staging。"
fi

# Deployment packages must not regain deleted media, local configuration, or
# legacy brand files through a stale standalone trace.
if find "$BUILD_DIR" -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.webm' -o -iname '*.avi' \) -print -quit | grep -q .; then
    echo "❌ Refusing to package video assets."
    exit 1
fi
if find "$BUILD_DIR" -type f \( -name '.env' -o -name '.env.*' \) -print -quit | grep -q .; then
    echo "❌ Refusing to package environment files."
    exit 1
fi

# ARTCOVR intentionally does not package the legacy arbitrary-port Caddy proxy.

# 复制 start.sh 脚本
echo "  - 复制 start.sh 到 $BUILD_DIR"
cp "$SCRIPT_DIR/start.sh" "$BUILD_DIR/start.sh"
chmod +x "$BUILD_DIR/start.sh"

# 打包到 $BUILD_DIR.tar.gz
echo ""
echo "📦 打包构建产物到 $PACKAGE_FILE..."
cd "$BUILD_DIR" || exit 1
tar -czf "$PACKAGE_FILE" .
cd - > /dev/null || exit 1

echo ""
echo "✅ 构建完成！所有产物已打包到 $PACKAGE_FILE"
echo "📊 打包文件大小:"
ls -lh "$PACKAGE_FILE"
