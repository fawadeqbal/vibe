#!/usr/bin/env bash
# Vibe — first-time setup. Run from the folder that holds vibe.zip:
#   bash setup_vibe.sh
set -e
cd "$(dirname "$0")"

if [ -f vibe.zip ]; then
  echo "Unzipping vibe.zip ..."
  if command -v unzip >/dev/null 2>&1; then unzip -o -q vibe.zip; else tar -xf vibe.zip; fi
fi
[ -d vibe ] || { echo "No vibe/ folder here."; exit 1; }
cd vibe

echo "Generating Android/iOS projects (existing files are kept) ..."
flutter create --org com.pingcrood --project-name vibe_app --platforms android,ios . >/dev/null
rm -f test/widget_test.dart

MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q "android.permission.CAMERA" "$MANIFEST"; then
  echo "Adding Android permissions ..."
  sed -i 's#<application#<uses-permission android:name="android.permission.CAMERA"/>\n    <uses-permission android:name="android.permission.RECORD_AUDIO"/>\n    <uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>\n    <uses-permission android:name="android.permission.BLUETOOTH"/>\n    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>\n    <application#' "$MANIFEST"
fi
# flutter_webrtc needs API 24+.
if [ -f android/app/build.gradle.kts ]; then
  sed -i 's/minSdk = flutter.minSdkVersion/minSdk = 24/' android/app/build.gradle.kts
elif [ -f android/app/build.gradle ]; then
  sed -i 's/minSdkVersion flutter.minSdkVersion/minSdkVersion 24/' android/app/build.gradle
fi

PLIST=ios/Runner/Info.plist
if [ -f "$PLIST" ] && ! grep -q NSCameraUsageDescription "$PLIST"; then
  echo "Adding iOS usage descriptions ..."
  sed -i '0,/<dict>/s#<dict>#<dict>\n\t<key>NSCameraUsageDescription</key>\n\t<string>Vibe uses your camera for video chat.</string>\n\t<key>NSMicrophoneUsageDescription</key>\n\t<string>Vibe uses your microphone for video chat.</string>#' "$PLIST"
fi

echo "Fetching packages ..."
flutter pub get
echo
echo "Done. Next:"
echo "  cd vibe && flutter run"
