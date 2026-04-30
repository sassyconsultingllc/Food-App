# Foodie Finder ProGuard / R8 rules.
#
# These rules apply when android.enableMinifyInReleaseBuilds=true (set in
# android/gradle.properties). Most modern React Native + Expo libraries
# ship consumer ProGuard rules of their own via .pro files in their
# release AARs, so we only need to add what isn't covered.
#
# When R8 strips a class that's only referenced via reflection (or via JNI),
# the build will succeed but the app will crash at first use. If a release
# build mysteriously breaks, add `-keep class <package>.** { *; }` for the
# offending library here.

# ─── React Native core ───────────────────────────────────────────────────────
# RN ships its own proguard rules but we belt-and-suspenders the JNI surface.
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.fabric.** { *; }
-keep class com.facebook.react.devsupport.** { *; }
-keep class com.facebook.react.modules.network.** { *; }
-keep class com.facebook.react.modules.image.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.proguard.annotations.DoNotStrip class *
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# Hermes engine — keep the JNI bridge intact even though Hermes itself is
# bytecode-compiled.
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jsi.** { *; }

# ─── Reanimated 4 (new arch) ────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ─── Gesture handler ────────────────────────────────────────────────────────
-keep class com.swmansion.gesturehandler.** { *; }

# ─── Expo modules ───────────────────────────────────────────────────────────
# Expo's modular core registers modules via reflection on the @ExpoModule
# annotation. Strip the annotation and modules silently disappear.
-keep class expo.modules.** { *; }
-keep class expo.modules.core.** { *; }
-keep,allowobfuscation @interface expo.modules.core.interfaces.* { *; }
-keepclassmembers class * {
    @expo.modules.kotlin.functions.AsyncFunction <methods>;
}

# expo-image (uses Glide internally — Glide ships its own rules but we keep
# the model classes that get serialized through the bridge).
-keep class com.bumptech.glide.** { *; }

# ─── Kotlin coroutines ──────────────────────────────────────────────────────
-keep class kotlinx.coroutines.** { *; }
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# ─── OkHttp / Okio (used by RN networking + tRPC client) ────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ─── Annotation hygiene ─────────────────────────────────────────────────────
# Keep the parameter, generic, and exception attributes so reflection-based
# JSON serializers (and stack traces!) don't lose information.
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses, SourceFile, LineNumberTable

# ─── Source-mapping ─────────────────────────────────────────────────────────
# Don't rename source-file references in stack traces — combined with the
# generated mapping.txt this lets Play Console print readable traces while
# still shrinking the APK.
-renamesourcefileattribute SourceFile

# ─── Misc consumer rules ────────────────────────────────────────────────────
# Keep custom application class (NewArchEnabled requires it for the JSI
# bridge to wire up correctly).
-keep public class * extends android.app.Application

# ─── Tolerance for R8 missing-class errors (AGP 8+) ─────────────────────────
# AGP 8 / R8 is strict: any unresolved class reference fails the build,
# even when it's only reached via @Optional or runtime-conditional code.
# RN + Expo libraries pull in a long tail of optional deps (kotlinx-
# serialization, slf4j, bouncycastle, GMS optional modules, etc.) that
# aren't actually used at runtime but trip R8's reachability analysis.
# -dontwarn for known optional packages keeps the build green; -keep
# above guarantees the runtime-critical classes stay anyway.
-dontwarn kotlinx.serialization.**
-dontwarn org.slf4j.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn java.lang.invoke.StringConcatFactory
-dontwarn javax.lang.model.**
-dontwarn javax.annotation.**
-dontwarn javax.naming.**
-dontwarn com.google.auto.value.**
-dontwarn com.google.api.client.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn org.jetbrains.annotations.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
-dontwarn android.os.Bundle
-dontwarn com.facebook.react.devsupport.**

# Final safety net: print warnings to the build log instead of failing.
# This is the same posture AGP 7 had by default; AGP 8 made it opt-in.
# The mapping.txt is still produced and crash deobfuscation still works.
-ignorewarnings
