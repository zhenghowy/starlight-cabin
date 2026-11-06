# 星空下的林中小屋 · 安卓安装包

这是给现有网页做的一层手机壳。应用名用的是站里的中文名字「星空下的林中小屋」。网站只有登录页有「下载 Android APK」，地址是 `/downloads/starlight-cabin-sideload-1.0.0.apk`。放在 `public/downloads/` 里的就是这一份测试包，构建后由 Express 以安装包类型送出。钥匙和口令不在这个公开目录里。

打开后直接进入已经在跑的线上服务：

https://starlight-cabin-howy.fly.dev

手机不运行 Express，也不保存 `data/` 里的账号、会话或营地。登录之后看到的松果币、打卡和林间排行，和浏览器里是同一份。

## 这包是什么签名

仓库里没有正式发布用的签名材料，所以这里放的是一把**公开的侧载测试钥匙**，不是应用商店的发布包，也没有上架。

| 项目 | 值 |
| --- | --- |
| 应用名 | 星空下的林中小屋 |
| 包名 | `io.github.zhenghowy.starlightcabin` |
| 版本 | `1.0.0`（`versionCode` 1） |
| 系统 | Android 8.0（API 26）及以上，按 API 35 编译 |
| 钥匙文件 | `android/keystore/starlight-cabin-sideload.jks` |
| 别名 | `starlight-sideload` |
| 证书 | `CN=Starlight Cabin Sideload Test, OU=Sideload, O=Starlight Cabin, C=CN` |
| 证书 SHA-256 | `D6:AB:C0:9F:CE:93:5A:E0:08:FB:95:96:ED:F5:01:1F:6E:7A:30:C8:B6:A0:39:B6:E6:B9:0C:2A:38:4A:34:C5` |

口令写在 `android/keystore.properties`。它是公开的，只为了让同一把钥匙可以反复打出能覆盖安装的包。谁拿到仓库都能用它签名。不要把它拿去当 Play 商店或正式对外发布的钥匙。

覆盖安装必须同时满足：包名不变、这把钥匙不变、新的 `versionCode` 比手机里已安装的更大。换了钥匙之后，系统会拒绝直接升级。那时要先卸载再装。卸载只清掉这只手机 WebView 里的登录会话，线上的账号、松果和排行还在，重新登录即可。

## 联网

没有网络就不能用。页面、登录、打卡、松果和排行都要访问上面的 HTTPS 地址。连不上时，应用停在「暂时走不进森林」，不会改用手机本地存档。

应用只声明了 `INTERNET`。没有定位、相机、麦克风、存储或通知权限。不明文传输，不信任用户安装的证书，证书校验失败时直接取消，不会放行。网页如果以后出现文件下载，这层壳会忽略，不会为此再要权限。

系统自带的 WebView 可能还会做一次安全浏览检查。应用自己没有统计、广告或其他服务器。登录会话是原来的 HttpOnly Cookie，大约 30 天，存在这只应用自己的 WebView 里，不进备份，也不和手机浏览器里的登录态共用。用同一个林间名字登录后，看到的仍是线上那一份营地。

## 手机上的行为

- 页面就是线上那个手机版网页，软键盘弹出时窗口会让出位置。
- 系统返回键先走网页历史（营地、杂货铺、年轮、排行），没有历史时才离开应用。
- 登录态跟这只应用绑定。卸掉、清数据，或服务器上的会话过期后，需要重新登录。
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
