import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// ── Integration keys for the native side (see ../../INTEGRATIONS_APP.md) ──
// Each value comes from, in order: a Gradle property (-PKEY=… or
// gradle.properties), the build's --dart-define / --dart-define-from-file
// (Flutter hands those to Gradle as `dart-defines`), an environment
// variable, then a safe default. So one `.env` file configures Dart and
// Android alike; nothing secret lives in the repo.
val dartDefines: Map<String, String> =
    (project.findProperty("dart-defines") as String?)
        ?.split(",")
        ?.mapNotNull { runCatching { String(Base64.getDecoder().decode(it)) }.getOrNull() }
        ?.mapNotNull { kv -> kv.indexOf('=').takeIf { it > 0 }?.let { kv.substring(0, it) to kv.substring(it + 1) } }
        ?.toMap()
        ?: emptyMap()

fun integration(key: String, default: String): String =
    listOf(project.findProperty(key) as String?, dartDefines[key], System.getenv(key))
        .firstOrNull { !it.isNullOrBlank() }
        ?.trim()
        ?: default

// Google's public AdMob *test* app id: serves only test ads, never pays.
val admobAppId = integration("ADMOB_APP_ID_ANDROID", "ca-app-pub-3940256099942544~3347511713")
// The Facebook SDK throws at start-up without an app id and client token,
// so placeholders keep it quiet until the real ones are set (the app hides
// the button until FACEBOOK_APP_ID / FACEBOOK_CLIENT_TOKEN reach Dart too).
val facebookAppId = integration("FACEBOOK_APP_ID", "000000000000000")
val facebookClientToken = integration("FACEBOOK_CLIENT_TOKEN", "00000000000000000000000000000000")

// Release signing from android/key.properties when present (not in git);
// otherwise release builds are signed with the debug key so `--release` runs.
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.pingcrood.vibe_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        resValues = true
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.pingcrood.vibe_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // 24: flutter_webrtc; also the minimum of google_mobile_ads,
        // google_sign_in_android and webview_flutter_android.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        manifestPlaceholders["admobAppId"] = admobAppId
        resValue("string", "facebook_app_id", facebookAppId)
        resValue("string", "facebook_client_token", facebookClientToken)
        resValue("string", "fb_login_protocol_scheme", "fb$facebookAppId")
    }

    signingConfigs {
        if (keystoreProperties.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            // Our keep rules on top of Flutter's and the libraries' own (see proguard-rules.pro).
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Play Install Referrer: reads "vibe_ref=CODE&utm_source=S" once on the
    // first launch (MainActivity.kt → InviteCapture) for invite attribution.
    implementation("com.android.installreferrer:installreferrer:2.2")
}
