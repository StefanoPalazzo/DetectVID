# DetectVID Mobile

Kotlin Multiplatform mobile app for DetectVID. It shares the UI and offline-first sync logic across Android and iOS with Compose Multiplatform.

## What this mobile app does

- Authenticates against the existing DetectVID backend (`/api/auth/login`, `/api/auth/register`).
- Captures a new photo from the native camera.
- Imports an existing image from the native photo/file picker.
- Stores images inside the app sandbox immediately, before any network call.
- Keeps a local JSON-backed queue at `detectvid_state.json` plus image files under `images/`.
- Retries sync automatically every 30 seconds while the app is open.
- Syncs pending photos with the existing web data flow:
  1. `POST /api/ml/predict` with multipart field `file`.
  2. Maps the ML response to the same result envelope used by the React app.
  3. `POST /api/analyses` with multipart field `image`, JSON field `result`, and optional GPS fields.
  4. Pulls `GET /api/analyses?limit=100` so mobile and web show the same history.

## Project structure

```text
mobile/
├── composeApp/                 # KMP app module
│   └── src/
│       ├── commonMain/         # Shared UI, queue, API client, sync engine
│       ├── androidMain/        # Android Activity, file system, camera/gallery picker
│       └── iosMain/            # iOS Compose UIViewController, file system, camera/gallery picker
├── iosApp/                     # Xcode shell app that embeds the KMP framework
└── gradle/                     # Gradle wrapper
```

## Android

Open `mobile/` in Android Studio and run the `composeApp` configuration.

If Android Studio asks for an SDK, install the compile SDK configured in `composeApp/build.gradle.kts`.

CLI check, once Android SDK is configured:

```bash
cd mobile
./gradlew :composeApp:assembleDebug
```

## iOS

Open:

```text
mobile/iosApp/DetectVID.xcodeproj
```

The Xcode target has a build phase that runs:

```bash
cd "$SRCROOT/.."
./gradlew :composeApp:embedAndSignAppleFrameworkForXcode
```

For physical iPhone testing, select your Apple Development Team in Xcode signing settings.

The app allows HTTP traffic because the current server is reachable at `http://192.168.3.231` over the private ZeroTier/OpenStack network.

## Default server

The default base URL is:

```text
http://192.168.3.231
```

It can be changed from the app UI without rebuilding.

## Verification performed here

```bash
cd mobile
./gradlew --no-daemon :composeApp:compileKotlinIosSimulatorArm64
```

Result: Kotlin/Native iOS sources compile successfully.

Not completed in this shell environment:

- Android compile: blocked because `ANDROID_HOME` / Android SDK is not configured in this shell.
- iOS framework link / `xcodebuild`: blocked because `xcode-select` points to Command Line Tools instead of a full Xcode installation.
