// Same AGP/Kotlin as the phone build, so nothing extra is downloaded.
plugins {
    id("com.android.application") version "9.2.1" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.21" apply false
}
