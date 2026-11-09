# 星空下的林中小屋 · 安卓安装包

应用名用的是站里的中文名字「星空下的林中小屋」。网站只有登录页提供当前安装包，地址是 `/downloads/starlight-cabin-sideload-1.1.0.apk`。上一版仍可从 `/downloads/starlight-cabin-sideload-1.0.0.apk` 下载。两份都在 `public/downloads/`，由 Express 以安装包类型送出。钥匙和口令不在这个公开目录里。

从 1.1.0 起，页面、营地和未同步记录放在手机本机数据库里，不依赖每次打开都连上服务器。账号仍是原来的线上账号。

- 第一次使用，或从 1.0.0 覆盖安装后还没有本机营地时，需要联网登录一次。密码不会留在手机里。若 1.0.0 的登录 Cookie 还在，应用会尝试用它把营地取回；取不回来就再登录一次。线上的存档不会另起一套账号。
- 之后大约每 7 天、有网络时，用系统的 WorkManager 后台同步。系统可以推迟，应用不会为了同步常驻前台，也不使用精确闹钟。若后台被限制，超过 7 天后再打开且有网时会补一次。每天打开不会重新等待服务器。
- 营地页可以手动「立即同步」，能看到上次成功时间、未同步条数和错误。排行榜是上次同步留下的快照，并写明时间，不是实时排名。
- 卸载或清除数据会丢掉还没同步的记录。没有打开系统云备份。同步面板里可以导出一份不含密码和登录凭证的本机 JSON 备份。

同步仍使用原来的线上服务：

https://starlight-cabin-howy.fly.dev

试用机大约每 5 分钟会停。这不影响已经取回的本机页面；同步要等机器醒来。手机不运行 Express，也不保存服务器 `data/` 里的账号文件。

## 这包是什么签名

仓库里没有正式发布用的签名材料，所以这里放的是一把**公开的侧载测试钥匙**，不是应用商店的发布包，也没有上架。

| 项目 | 值 |
| --- | --- |
| 应用名 | 星空下的林中小屋 |
| 包名 | `io.github.zhenghowy.starlightcabin` |
| 版本 | `1.1.0`（`versionCode` 2） |
| 系统 | Android 8.0（API 26）及以上，按 API 35 编译 |
| 钥匙文件 | `android/keystore/starlight-cabin-sideload.jks` |
| 别名 | `starlight-sideload` |
| 证书 | `CN=Starlight Cabin Sideload Test, OU=Sideload, O=Starlight Cabin, C=CN` |
| 证书 SHA-256 | `D6:AB:C0:9F:CE:93:5A:E0:08:FB:95:96:ED:F5:01:1F:6E:7A:30:C8:B6:A0:39:B6:E6:B9:0C:2A:38:4A:34:C5` |

口令写在 `android/keystore.properties`。它是公开的，只为了让同一把钥匙可以反复打出能覆盖安装的包。谁拿到仓库都能用它签名。不要把它拿去当 Play 商店或正式对外发布的钥匙。

覆盖安装必须同时满足：包名不变、这把钥匙不变、新的 `versionCode` 比手机里已安装的更大。1.0.0 可以不卸载直接装上 1.1.0。换了钥匙之后，系统会拒绝直接升级。那时要先卸载再装。卸载会清掉这只手机上还没同步的记录；已经同步到线上的账号、松果和排行还在。

## 联网

页面资源打进安装包，打开时不向服务器要网页。已经登录过的营地、打卡、正负松果和适合本机的杂货铺，断网也能看、也能记。第一次注册、登录，或从旧版把营地取回来，需要联网。同步凭证放在加密存储里，不交给网页任意调用，也不写入备份。只信任系统证书，证书校验失败时直接取消。

应用声明了 `INTERNET` 和 `ACCESS_NETWORK_STATE`。WorkManager 还会带上它自己的唤醒、开机和前台服务权限，应用不会为此常驻。没有定位、相机、麦克风或存储权限。网页里的文件下载仍会被忽略。

## 手机上的行为

- 软键盘弹出时窗口会让出位置。
- 系统返回键先走页面历史（营地、杂货铺、年轮、排行），没有历史时才离开应用。
- 退出登录会清掉同步凭证，但留下未同步记录。换一个账号登录时，各自的记录分开保存。
- 登录过期、超时或同步失败不会清空本机数据。和服务器对不上的操作会留在同步面板里，不会悄悄丢掉。
- 请让系统 WebView（或 Chrome）保持较新。太旧的 WebView 可能打不开现在的页面。

## 自己打包

需要 JDK 17 或更新版本，以及 Android SDK：

- `platforms;android-35`
- `build-tools;35.0.0`
- `platform-tools`

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
sdkmanager --install "platforms;android-35" "build-tools;35.0.0" "platform-tools"
ANDROID_HOME="$ANDROID_HOME" sh scripts/build-android-apk.sh
```

脚本会跑单元测试、打 release 包，再用 `scripts/verify-android-apk.sh` 核对签名、包名、权限和 APK 结构。产物在：

`android/app/build/outputs/apk/release/app-release.apk`

Gradle 使用仓库里的 Wrapper（8.11.1）和 Android Gradle Plugin 8.8.2。第一次构建会下载依赖。

安装到自己的手机时，用系统的「安装未知应用」即可，不需要应用商店。升级时直接安装新的 APK，不要先卸载，否则这只手机上的登录会话会被清掉。
