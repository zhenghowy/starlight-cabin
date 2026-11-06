#!/bin/sh
# 检查侧载 APK 的签名、包名、权限，以及有没有把服务器存档打进去。
# 用法：ANDROID_HOME=/path/to/sdk sh scripts/verify-android-apk.sh path/to/app.apk
set -eu

if [ "$#" -ne 1 ]; then
  echo "用法：sh scripts/verify-android-apk.sh <apk>" >&2
  exit 1
fi

APK=$1
if [ ! -f "$APK" ]; then
  echo "找不到 APK：$APK" >&2
  exit 1
fi

if [ -z "${ANDROID_HOME:-}" ]; then
  echo "请先设置 ANDROID_HOME。" >&2
  exit 1
fi

BT=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)
AAPT=$BT/aapt
APKSIGNER=$BT/apksigner
if [ ! -x "$AAPT" ] || [ ! -x "$APKSIGNER" ]; then
  echo "build-tools 里没有 aapt 或 apksigner：$BT" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "使用 $BT"
"$AAPT" dump badging "$APK" > "$TMP/badging.txt"
"$AAPT" dump xmltree "$APK" AndroidManifest.xml > "$TMP/manifest.txt"
if ! "$APKSIGNER" verify --verbose --print-certs "$APK" > "$TMP/certs.txt"; then
  cat "$TMP/certs.txt" >&2
  exit 1
fi
cat "$TMP/certs.txt"

python3 - "$APK" "$TMP" <<'PY'
import pathlib
import sys
import zipfile

apk = pathlib.Path(sys.argv[1])
tmp = pathlib.Path(sys.argv[2])
badging = (tmp / "badging.txt").read_text()
certs = (tmp / "certs.txt").read_text()
manifest = (tmp / "manifest.txt").read_text()
certs_folded = certs.lower().replace(":", "")

def need(text, needle, label):
    if needle not in text:
        raise SystemExit(f"缺少{label}：{needle}")

need(badging, "package: name='io.github.zhenghowy.starlightcabin'", "包名")
need(badging, "versionCode='1'", "versionCode")
need(badging, "versionName='1.0.0'", "versionName")
need(badging, "sdkVersion:'26'", "最低系统")
need(badging, "targetSdkVersion:'35'", "目标系统")
need(badging, "application-label:'星空下的林中小屋'", "应用名")
need(certs, "Verified using v2 scheme (APK Signature Scheme v2): true", "v2 签名")
need(certs, "Verified using v3 scheme (APK Signature Scheme v3): true", "v3 签名")
need(certs_folded, "cn=starlight cabin sideload test", "侧载测试证书")
need(certs_folded, "d6abc09fce935ae008fb9596edf5011f6e7a30c8b6a039b6e6b90c2a384a34c5", "证书指纹")

if "application-debuggable" in badging:
    raise SystemExit("release APK 不能带调试标记")
if "testOnly='true'" in badging or 'testOnly="true"' in badging:
    raise SystemExit("release APK 不能是 testOnly")

permissions = [
    line for line in badging.splitlines()
    if "uses-permission" in line and "uses-implied-permission" not in line
]
expected = ["uses-permission: name='android.permission.INTERNET'"]
if permissions != expected:
    raise SystemExit("权限不只 INTERNET：\n" + "\n".join(permissions))

cleartext = [line.strip() for line in manifest.splitlines() if "usesCleartextTraffic" in line]
if cleartext != ["A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0"]:
    raise SystemExit("明文流量没有关闭：\n" + "\n".join(cleartext))

data = apk.read_bytes()
if b"https://starlight-cabin-howy.fly.dev" not in data:
    raise SystemExit("APK 里没有线上小屋地址")
if b"http://starlight-cabin-howy.fly.dev" in data:
    raise SystemExit("APK 里写进了小屋的 http 地址")

with zipfile.ZipFile(apk) as zf:
    names = zf.namelist()

if "AndroidManifest.xml" not in names or "resources.arsc" not in names:
    raise SystemExit("APK 结构不完整")
if not any(name.startswith("classes") and name.endswith(".dex") for name in names):
    raise SystemExit("APK 里没有 classes.dex")

banned_parts = ("users.json", "sessions.json", ".env", "server/app.js", "server/index.js")
for name in names:
    lowered = name.lower()
    for part in banned_parts:
        if part in lowered:
            raise SystemExit(f"APK 不该带上服务器文件：{name}")

size = apk.stat().st_size
if size > 20 * 1024 * 1024:
    raise SystemExit(f"APK 大得不像一个网页壳：{size} 字节")
print(f"结构检查通过，体积 {size} 字节")
PY
