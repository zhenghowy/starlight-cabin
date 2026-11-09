# 清单里的活动由 Android Gradle 插件默认保留。
-keepclassmembers class io.github.zhenghowy.starlightcabin.CabinBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-dontwarn com.google.errorprone.annotations.Immutable
-dontwarn javax.annotation.concurrent.GuardedBy
