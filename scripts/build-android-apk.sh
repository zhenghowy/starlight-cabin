#!/bin/sh
# 打出可侧载的 release APK。需要本机已有 JDK 17+ 和 Android SDK。
# 用法：ANDROID_HOME=/path/to/sdk sh scripts/build-android-apk.sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT/android"

if [ -z "${ANDROID_HOME:-}" ]; then
  echo "请先设置 ANDROID_HOME，指向含 platforms、build-tools 和 cmdline-tools 的 Android SDK。" >&2
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "请先安装 JDK 17 或更新版本。" >&2
  exit 1
fi

printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
chmod +x ./gradlew
./gradlew --no-daemon :app:test :app:assembleRelease

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK" ]; then
  echo "没有找到 release APK：$APK" >&2
  exit 1
fi

echo "APK=$APK"
sha256sum "$APK"
sh "$ROOT/scripts/verify-android-apk.sh" "$APK"
