# Extra R8 keep rules for release builds (shrinking is on by default).

# WorkManager's Room database (pulled in by Google Mobile Ads and Firebase).
# Room creates the generated WorkDatabase_Impl through reflection; without
# this, R8 drops its constructor and the app crashes on launch with
# "Failed to create an instance of androidx.work.impl.WorkDatabase".
-keep class * extends androidx.room.RoomDatabase { <init>(); }

# Credential Manager (Google sign-in) loads its Play Services provider by
# reflection.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }
