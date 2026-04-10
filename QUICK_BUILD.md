# 🚀 Foodie Finder - Quick Build Commands

## For Windows Users (RECOMMENDED)

### 1. Install Prerequisites (One Time Setup)
```cmd
# Install Node.js 18+ from https://nodejs.org
# Then install tools:

npm install -g pnpm
npm install -g eas-cli
```

### 2. Login to Expo (One Time Setup)
```cmd
cd "V:\Projects\foodie-finder v8"
eas login
```

### 3. Install Dependencies
```cmd
cd "V:\Projects\foodie-finder v8"
pnpm install
```

### 4. Build APK for Testing
```cmd
# Option A: Use script
build-android.bat preview

# Option B: Direct command
eas build --platform android --profile preview
```

### 5. Build AAB for Play Store
```cmd
# Option A: Use script
build-android.bat prod

# Option B: Direct command
eas build --platform android --profile production
```

---

## Build Profiles

| Command | Output | Size | Use Case |
|---------|--------|------|----------|
| `build-android.bat dev` | APK | ~60 MB | Development |
| `build-android.bat preview` | APK | ~50 MB | **Testing** ⭐ |
| `build-android.bat prod` | AAB | ~30 MB | **Play Store** ⭐ |

---

## Complete Workflow

### For Testing
```cmd
# 1. Navigate to project
cd "V:\Projects\foodie-finder v8"

# 2. Build preview APK
build-android.bat preview

# 3. Wait 10-20 minutes for build
# You'll get an email with download link

# 4. Download APK from Expo dashboard
# https://expo.dev

# 5. Install on device
adb install foodie-finder-*.apk
```

### For Play Store Release
```cmd
# 1. Build production AAB
build-android.bat prod

# 2. Download AAB when ready
# https://expo.dev

# 3. Upload to Google Play Console
# https://play.google.com/console
```

---

## Troubleshooting

### "eas: command not found"
```cmd
npm install -g eas-cli
```

### "Not logged in"
```cmd
eas login
```

### "Build failed"
```cmd
# Check build logs
eas build:list
eas build:view [build-id]
```

### Want local build? (Advanced)
```cmd
# Note: Local builds are NOT recommended
# Use EAS Build (cloud) instead for reliability

# If you really need local build:
eas build --platform android --profile preview --local
```

---

## Next Steps After Build

### APK Downloaded
1. **Enable Unknown Sources** on Android device
   - Settings → Security → Unknown Sources
2. **Transfer APK** to device
3. **Install** by tapping the APK
4. **Test** the app

### AAB Downloaded
1. **Create Google Play Console account**
   - https://play.google.com/console
2. **Create new app**
3. **Upload AAB** to Internal Testing
4. **Add testers** via email
5. **Share testing link**
6. **Get feedback**
7. **Promote to Production** when ready

---

## 📱 Testing on Device

### Via USB (ADB)
```cmd
# Enable USB Debugging on device
# Connect via USB cable
adb devices
adb install foodie-finder-*.apk
```

### Via File Transfer
1. Copy APK to device
2. Open file manager on device
3. Tap APK file
4. Allow installation from unknown sources
5. Install

### Via Google Play (Internal Testing)
1. Upload AAB to Internal Testing
2. Add tester emails in Play Console
3. Testers receive email invite
4. Install from Play Store (testing track)

---

## ⚡ Fastest Path to APK

```cmd
cd "V:\Projects\foodie-finder v8"
eas login
pnpm install
eas build --platform android --profile preview
```

Wait 10-20 minutes → Download APK → Install on device → Done! ✅

---

## Local services (Redis + Pushgateway) 🔧

If you want to run the staging services locally (Redis + Pushgateway) for integration testing and metrics:

- Start services:
```bash
cd "V:\Projects\foodie-finder v8"
docker-compose up -d
```

- Confirm services:
  - Redis:
    ```bash
    redis-cli -h 127.0.0.1 ping # -> PONG
    ```
  - Pushgateway:
    ```bash
    curl http://127.0.0.1:9091/metrics
    ```

- Run the integration test (requires services running):
```bash
PUSHGATEWAY_URL=http://127.0.0.1:9091 REDIS_URL=redis://127.0.0.1:6379 pnpm test -t push-metrics-integration
```

- Notes: Docker Desktop / Docker Engine required.

---

## 📞 Support

- **Build Issues**: Check `eas build:list` and logs
- **Expo Docs**: https://docs.expo.dev/build/introduction/
- **Your Builds**: https://expo.dev
- **Play Console**: https://play.google.com/console

---

**Created:** January 14, 2025  
**Project:** Foodie Finder v8  
**Package:** space.sassy.foodie.finder.t20251222143704
