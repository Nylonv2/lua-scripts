#!/usr/bin/env bash
# Builds RiasCompanion.apk (repo root) from the web app plus the small Java shell in src/.
# Needs Java 17+ and network access to GitHub releases and Maven Central for the tools.
set -euo pipefail
cd "$(dirname "$0")"
HERE=$PWD
TOOLS=$HERE/.tools
WORK=$HERE/.build
OUT=$HERE/../../RiasCompanion.apk

fetch() { [ -s "$2" ] || { mkdir -p "$(dirname "$2")"; curl -sSfL --retry 4 -o "$2" "$1"; }; }
fetch https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar "$TOOLS/apktool/apktool.jar"
fetch https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar "$TOOLS/signer/uber-apk-signer.jar"
fetch https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar "$TOOLS/dx/dx.jar"
# Android 14 (API 34) framework classes to compile against.
fetch https://repo1.maven.org/maven2/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar "$TOOLS/android/android-all-34.jar"
# "Hey …" wake word: Vosk offline speech recognition (Apache 2.0) and JNA, which it uses to reach its native library.
fetch https://repo1.maven.org/maven2/com/alphacephei/vosk-android/0.3.47/vosk-android-0.3.47.aar "$TOOLS/vosk/vosk-android.aar"
fetch https://repo1.maven.org/maven2/net/java/dev/jna/jna/5.13.0/jna-5.13.0.aar "$TOOLS/vosk/jna.aar"
for aar in vosk-android jna; do
  [ -d "$TOOLS/vosk/$aar" ] || (mkdir -p "$TOOLS/vosk/$aar" && cd "$TOOLS/vosk/$aar" && unzip -q ../$aar.aar)
done
# Only Vosk's core classes (its Android helpers need API 26; WakeService has its own microphone loop).
[ -d "$TOOLS/vosk/core" ] || (mkdir -p "$TOOLS/vosk/core" && cd "$TOOLS/vosk/core" && unzip -q ../vosk-android/classes.jar 'org/vosk/*.class' -x 'org/vosk/android/*')
LIBS="$TOOLS/vosk/core:$TOOLS/vosk/jna/classes.jar"

rm -rf "$WORK" && mkdir -p "$WORK/classes" "$WORK/app/assets/www"

echo "Compiling Java…"
javac -nowarn --release 8 -encoding UTF-8 \
  -cp "$TOOLS/android/android-all-34.jar:$LIBS" \
  -d "$WORK/classes" $(find src -name '*.java')

echo "Converting to dex…"
java -cp "$TOOLS/dx/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 \
  --output="$WORK/app/classes.dex" "$WORK/classes" "$TOOLS/vosk/core" "$TOOLS/vosk/jna/classes.jar"

echo "Packaging…"
cp AndroidManifest.xml apktool.yml "$WORK/app/"
cp -r res "$WORK/app/res"
for abi in arm64-v8a armeabi-v7a; do   # phones only; the speech model itself downloads when "Hey …" is turned on
  mkdir -p "$WORK/app/lib/$abi"
  cp "$TOOLS/vosk/vosk-android/jni/$abi/libvosk.so" "$TOOLS/vosk/jna/jni/$abi/libjnidispatch.so" "$WORK/app/lib/$abi/"
done
# Kokoro voice: sherpa-onnx (Apache-2.0) engine, 64-bit phones only (its model downloads when chosen in Settings)
SHERPA=v1.13.6
fetch https://github.com/k2-fsa/sherpa-onnx/releases/download/$SHERPA/sherpa-onnx-$SHERPA-android.tar.bz2 "$TOOLS/sherpa/android.tar.bz2"
[ -f "$TOOLS/sherpa/jniLibs/arm64-v8a/libsherpa-onnx-jni.so" ] || (cd "$TOOLS/sherpa" && tar xjf android.tar.bz2 ./jniLibs/arm64-v8a/libsherpa-onnx-jni.so ./jniLibs/arm64-v8a/libonnxruntime.so)
cp "$TOOLS/sherpa/jniLibs/arm64-v8a/libsherpa-onnx-jni.so" "$TOOLS/sherpa/jniLibs/arm64-v8a/libonnxruntime.so" "$WORK/app/lib/arm64-v8a/"
mkdir -p "$WORK/app/res/raw" && cp ../sounds/alarm_*.ogg "$WORK/app/res/raw/"   # alarm sounds (sounds/make_sounds.py)
(cd .. && cp -r index.html style.css app.js dialogue.js talk.js chat.js food.js work.js ai.js rias-avatar.js living-photo.js photo-cutout.js alarm-card.js natural-voice.js assistant.js biz.js translate.js alarm.html assist.html manifest.webmanifest sw.js icons "$WORK/app/assets/www/")
mkdir -p "$WORK/app/assets/www/vendor/mediapipe" && cp ../vendor/anthropic-sdk.js "$WORK/app/assets/www/vendor/" && cp ../vendor/mediapipe/vision_bundle.js "$WORK/app/assets/www/vendor/mediapipe/"
java -jar "$TOOLS/apktool/apktool.jar" b "$WORK/app" -o "$WORK/unsigned.apk"

echo "Signing…"
java -jar "$TOOLS/signer/uber-apk-signer.jar" --apks "$WORK/unsigned.apk" --out "$WORK/signed" >/dev/null
cp "$WORK"/signed/*.apk "$OUT"
echo "Built $(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

# The app's update check reads this from GitHub.
CODE=$(sed -n "s/^ *versionCode: '\{0,1\}\([0-9]*\)'\{0,1\}/\1/p" apktool.yml)
NAME=$(sed -n "s/^ *versionName: '\{0,1\}\([^']*\)'\{0,1\}/\1/p" apktool.yml)
cat > ../version.json <<JSON
{
  "versionCode": $CODE,
  "versionName": "$NAME",
  "apk": "https://github.com/nylonv2/lua-scripts/raw/master/RiasCompanion.apk"
}
JSON
echo "Wrote version.json ($NAME, build $CODE)"
