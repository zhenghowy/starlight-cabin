import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createApp } from './app.js'

const port = Number(process.env.PORT) || 43123
const host = process.env.HOST || '0.0.0.0'
const app = createApp()

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  app.listen(port, host, () => {
    console.log(`星空下的林中小屋已点灯 http://127.0.0.1:${port}`)
  })
}
