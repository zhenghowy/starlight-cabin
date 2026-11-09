import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystoreProperties = Properties().apply {
    rootProject.file("keystore.properties").inputStream().use { load(it) }
}

android {
    namespace = "io.github.zhenghowy.starlightcabin"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.zhenghowy.starlightcabin"
        minSdk = 26
        targetSdk = 35
        // 覆盖安装时 versionCode 必须比手机里已装的那一版更大，并且仍用同一把侧载钥匙。
        versionCode = 2
        versionName = "1.1.0"
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("sideload") {
            storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
            storePassword = keystoreProperties.getProperty("storePassword")
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("keyPassword")
            enableV1Signing = false
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "CABIN_ORIGIN", "\"http://10.0.2.2:43127\"")
        }
        release {
            buildConfigField("String", "CABIN_ORIGIN", "\"https://starlight-cabin-howy.fly.dev\"")
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("sideload")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

configurations.configureEach {
    // baseline profile 安装器会再注册一个启动组件，这个网页壳用不到。
    exclude(group = "androidx.profileinstaller", module = "profileinstaller")
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.security:security-crypto:1.0.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    testImplementation("junit:junit:4.13.2")
}
