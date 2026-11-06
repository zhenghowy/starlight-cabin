import { APK_NAME, APK_PATH } from '@shared/apk.js'

export function ApkDownload({ placement = 'card' }) {
  return (
    <aside className={placement === 'bar' ? 'apk-bar' : 'apk-note'}>
      <a href={APK_PATH} download={APK_NAME}>
        下载 Android APK
      </a>
      <p>Android 8.0 及以上的测试版，需要联网。安装时请允许来自浏览器的安装。这是侧载测试签名，不是正式发布包。</p>
    </aside>
  )
}
