#!/bin/sh
# 在已登录 fly.io 的机器上，一条命令把小屋部署到公网并挂上持久磁盘。
# 用法：sh scripts/deploy-fly.sh
set -eu

APP="${FLY_APP_NAME:-starlight-cabin}"
REGION="${FLY_REGION:-hkg}"

if ! command -v fly >/dev/null 2>&1; then
  echo "还没有 fly 命令。先安装：curl -L https://fly.io/install.sh | sh" >&2
  exit 1
fi

fly apps create "$APP" || true
fly volumes create cabin_data --region "$REGION" --size 1 --app "$APP" --yes || true
fly secrets set COOKIE_SECURE=1 --app "$APP"
fly deploy --app "$APP" --ha=false

echo "部署完成后访问：https://${APP}.fly.dev"
echo "打开页面，点「还没有账号？种下一颗种子」，注册第一个林间名字。"
