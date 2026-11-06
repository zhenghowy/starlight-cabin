package io.github.zhenghowy.starlightcabin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CabinUrlsTest {
    @Test
    fun pointsAtTheLiveCabin() {
        assertEquals("starlight-cabin-howy.fly.dev", CabinUrls.HOST)
        assertEquals("https://starlight-cabin-howy.fly.dev", CabinUrls.ORIGIN)
        assertEquals("https://starlight-cabin-howy.fly.dev/", CabinUrls.START_URL)
        assertTrue(CabinUrls.isInAppUrl(CabinUrls.START_URL))
    }

    @Test
    fun allowsPagesOnTheCabinHost() {
        listOf(
            "https://starlight-cabin-howy.fly.dev/",
            "https://starlight-cabin-howy.fly.dev/login",
            "https://starlight-cabin-howy.fly.dev/register",
            "https://starlight-cabin-howy.fly.dev/shop",
            "https://starlight-cabin-howy.fly.dev/log",
            "https://starlight-cabin-howy.fly.dev/board",
            "https://starlight-cabin-howy.fly.dev/board/u_abc123",
            "https://starlight-cabin-howy.fly.dev/api/me",
            "https://starlight-cabin-howy.fly.dev:443/",
            "https://STARLIGHT-CABIN-HOWY.FLY.DEV/login",
            "  https://starlight-cabin-howy.fly.dev/login  "
        ).forEach { url ->
            assertTrue(url, CabinUrls.isInAppUrl(url))
            assertFalse(url, CabinUrls.isExternalWebUrl(url))
        }
    }

    @Test
    fun rejectsAnythingThatIsNotTheCabinOverHttps() {
        listOf(
            null,
            "",
            "   ",
            "http://starlight-cabin-howy.fly.dev/",
            "https://evil.com/",
            "https://starlight-cabin-howy.fly.dev.evil.com/",
            "https://evil.starlight-cabin-howy.fly.dev/",
            "https://notstarlight-cabin-howy.fly.dev/",
            "https://user:pass@starlight-cabin-howy.fly.dev/",
            "https://starlight-cabin-howy.fly.dev:8443/",
            "https://starlight-cabin-howy.fly.dev@evil.com/",
            "javascript:alert(1)",
            "file:///data/users.json",
            "data:text/html,hi",
            "about:blank",
            "intent://starlight-cabin-howy.fly.dev/#Intent;scheme=https;end",
            "https://starlight-cabin-howy.fly.dev/\nhttps://evil.com",
            "https://starlight-cabin-howy.fly.dev\\@evil.com/"
        ).forEach { url ->
            assertFalse(url, CabinUrls.isInAppUrl(url))
        }
    }

    @Test
    fun externalLinksStayInABrowserAndOddSchemesDoNot() {
        assertTrue(CabinUrls.isExternalWebUrl("https://example.com/help"))
        assertTrue(CabinUrls.isExternalWebUrl("http://example.com/"))
        assertTrue(CabinUrls.isExternalWebUrl("http://starlight-cabin-howy.fly.dev/"))
        assertFalse(CabinUrls.isExternalWebUrl("javascript:alert(1)"))
        assertFalse(CabinUrls.isExternalWebUrl("intent://scan/#Intent;end"))
        assertFalse(CabinUrls.isExternalWebUrl("https://user:pass@example.com/"))
        assertFalse(CabinUrls.isExternalWebUrl("file:///sdcard/x"))
    }

    @Test
    fun backGoesThroughPagesThenLeaves() {
        assertEquals(CabinUrls.BackAction.GO_BACK_IN_PAGE, CabinUrls.decideBack(true))
        assertEquals(CabinUrls.BackAction.LEAVE_APP, CabinUrls.decideBack(false))
    }

    @Test
    fun manifestAsksOnlyForInternetAndRefusesCleartext() {
        val manifest = readProjectFile("src/main/AndroidManifest.xml")
        val permissions = Regex("""<uses-permission\b([^>]*?)/?\s*>""")
            .findAll(manifest)
            .map { it.groupValues[1] }
            .filterNot { it.contains("""tools:node="remove"""") }
            .map { tag ->
                Regex("""android:name="([^"]+)"""").find(tag)?.groupValues?.get(1)
                    ?: error("uses-permission 没有名字：$tag")
            }
            .toList()
        assertEquals(listOf("android.permission.INTERNET"), permissions)
        assertTrue(manifest.contains("""android:usesCleartextTraffic="false""""))
        assertFalse(manifest.contains("""android:usesCleartextTraffic="true""""))
        assertTrue(manifest.contains("""android:allowBackup="false""""))
    }

    @Test
    fun networkSecurityTrustsOnlyTheSystemStore() {
        val xml = readProjectFile("src/main/res/xml/network_security_config.xml")
        assertTrue(xml.contains("""cleartextTrafficPermitted="false""""))
        assertTrue(xml.contains("""src="system""""))
        assertFalse(xml.contains("""src="user""""))
    }

    @Test
    fun shellDoesNotBypassTlsOrExposeAJavascriptBridge() {
        val source = readProjectFile("src/main/java/io/github/zhenghowy/starlightcabin/MainActivity.kt")
        assertFalse(source.contains("handler.proceed"))
        assertFalse(source.contains(".proceed("))
        assertTrue(source.contains("handler.cancel()"))
        assertFalse(source.contains("setWebContentsDebuggingEnabled(true)"))
        assertTrue(source.contains("setWebContentsDebuggingEnabled(false)"))
        assertFalse(source.contains("addJavascriptInterface"))
    }

    private fun readProjectFile(path: String): String {
        val file = File(path)
        assertTrue("找不到 $path ，当前目录是 ${File(".").absolutePath}", file.isFile)
        return file.readText()
    }
}
