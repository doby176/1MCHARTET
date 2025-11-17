#################################################################
# ProGuard / R8 configuration for Scan2Chat
# Keeps only the classes that must stay readable while shrinking
# everything else for stronger reverse-engineering protection.
#################################################################

# ---- Core Android components (Activities / Services / Receivers) ----
-keep class com.scan2chat.app.** extends android.app.Activity { *; }
-keep class com.scan2chat.app.** extends android.app.Service { *; }
-keep class com.scan2chat.app.** extends android.content.BroadcastReceiver { *; }
-keep class com.scan2chat.app.** extends android.app.Application { *; }
-keep class com.scan2chat.app.** extends android.app.Dialog { *; }

# Custom Views (need public constructors for inflation)
-keep class com.scan2chat.app.** extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# Data classes used with Firebase / Gson
-keepclassmembers class com.scan2chat.app.ReplyData { *; }

# ---- Firebase / ML Kit / Play Services ----
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ---- PayPal SDK ----
-keep class com.paypal.checkout.** { *; }
-dontwarn com.paypal.checkout.**

# PayPal ships CardinalCommerce (3DS) and minidev JSON helpers
-keep class com.cardinalcommerce.** { *; }
-dontwarn com.cardinalcommerce.**
-keep class com.cardinalcommerce.dependencies.internal.minidev.** { *; }
-dontwarn com.cardinalcommerce.dependencies.internal.minidev.**

# Keep BouncyCastle providers used via ServiceLoader
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# ---- Keep generated R classes (Android resources) ----
-keep class **.R {
    *;
}
-keep class **.R$* {
    *;
}

# Strip source file / line info from stack traces in release builds
-renamesourcefileattribute "obfuscated"
-keepattributes SourceFile,LineNumberTable
