# 星空下的林中小屋

原来的微信小程序，现在是一个手机优先的网页。三间屋子还在：

- **我的营地**：星空小屋会随着学识、能量、秩序、储蓄慢慢变化。完成今日小事就打卡。
- **林间杂货铺**：松果币换成现实里的奖励，也可以自己加心愿。
- **岁月年轮**：累计天数、连续天数，和近 12 周的打卡墙。

约定 1 分钟 = 1 枚松果，金额仍可自己改。好事打卡会加上松果；放纵或坏习惯写成负数，完成时扣掉松果，不够就记成欠下的数。等级不会因为放纵而降低。过了北京时间零点，今天的小事会重新点亮，等级和松果不会因为跨天而减少。

大约按 10 位朋友来设计。没有数据库，每个人一份 JSON 存档。

## 注册第一个账号

1. 打开网站。
2. 点「还没有账号？种下一颗种子」。
3. 写一个 2 到 16 位的林间名字，设至少 6 位密码。
4. 注册成功会直接走进自己的营地。

名字不能重复。默认最多 20 个账号，可以用环境变量 `MAX_USERS` 调整。朋友都进来之后，把 `ALLOW_REGISTER=0` 再启动，就不再接受新人。

## 本地运行

需要 Node.js 20 或更新。

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:43123](http://127.0.0.1:43123)。

`npm run dev` 会同时启动页面和接口。页面在 43123，接口在 8787，由 Vite 把 `/api` 转过去。

生产模式是同一个进程同时提供页面和接口：

```bash
npm test
npm run build
npm start
```

默认地址仍是 [http://127.0.0.1:43123](http://127.0.0.1:43123)。端口用 `PORT` 修改。

## 数据存在哪里

浏览器只保存登录会话（HttpOnly Cookie），**不**把存档放进 localStorage。存档在服务器的 `data/` 目录：

| 文件 | 内容 |
| --- | --- |
| `data/users.json` | 林间名字和 scrypt 密码哈希 |
| `data/sessions.json` | 登录会话，约 30 天过期 |
| `data/saves/<用户 id>.json` | 这个人的营地。结构与小程序里的 `starlight_cabin_store` 相同 |

一份存档大致是：

```json
{
  "user_profile": {
    "pine_cones": 0,
    "attributes": {
      "study": { "level": 1, "exp": 0 },
      "fitness": { "level": 1, "exp": 0 },
      "routine": { "level": 1, "exp": 0 },
      "saving": { "level": 1, "exp": 0 }
    }
  },
  "tasks": [],
  "shop_items": [],
  "history_logs": [],
  "last_open_date": "2026-11-03"
}
```

写入时先写临时文件再改名，避免写到一半损坏。复制整个 `data/` 就是备份。这个目录已在 `.gitignore` 里，不要提交。

日期按北京时间计算。打过卡的日子记在 `history_logs`，年轮页用它画打卡墙和连续天数。

登录后，底部「林间排行」可以看到每位朋友的公开进度：合计等级、四项属性等级、松果币、连续打卡、累计天数，以及今天已经完成的小事。点进一个人，能看到营地画面和最近打卡日期。心愿、未完成的小事、密码和登录会话不会出现在排行榜上。未登录访问会回到登录页。

## 环境变量

参见 `.env.example`。

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PORT` | 监听端口 | `43123` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `DATA_DIR` | 存档目录 | `./data` |
| `COOKIE_SECURE` | 设为 `1` 时 Cookie 带 Secure，只在 HTTPS 下发送 | 关闭 |
| `ALLOW_REGISTER` | 设为 `0` 关闭注册 | 开启 |
| `MAX_USERS` | 账号上限 | `20` |

本地用 http 时不要打开 `COOKIE_SECURE`，否则登录态写不进浏览器。

## 部署到公网（保持 24 小时在线）

这个环境里没有已登录的托管账号，所以没有替你生成一个永久网址。页面和接口必须跑在**带持久磁盘**的机器上，纯静态托管保存不了存档。

构建产物用 `npm run build` 生成到 `dist/`。下面的 Docker 镜像会在构建时自己跑这一步。

### 一台有公网 IP 的机器

```bash
docker build -t starlight-cabin . && docker run -d --name starlight-cabin --restart unless-stopped -p 8080:8080 -e COOKIE_SECURE=0 -v starlight-data:/app/data starlight-cabin
```

前面再加一层 HTTPS（Caddy 或 Nginx）后，把 `COOKIE_SECURE` 设为 `1`。卷 `starlight-data` 要留着，删掉就会失去账号和营地。

### Fly.io（一条命令）

先安装并登录：[fly.io/docs/hands-on/install-flyctl](https://fly.io/docs/hands-on/install-flyctl/)。`fly.toml` 里的应用名如果被占用，改成别的，并设置 `FLY_APP_NAME`。

```bash
sh scripts/deploy-fly.sh
```

脚本会创建应用、一块 1GB 的持久卷 `cabin_data`（挂到 `/app/data`），然后部署。至少保持 1 台机器运行，不会在空闲时睡掉。完成后打开脚本打印的 `https://<应用名>.fly.dev`，按上面的步骤注册第一个账号。

卷必须先于部署存在，否则机器起不来。脚本里已经包含创建卷；如果卷已在，那一步会跳过。
