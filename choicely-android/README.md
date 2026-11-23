# Android native patches

Patches to React Native libraries that every Choicely Android app builds with, and the
script that applies them.

- `npm install` runs `scripts/apply-rn-patches.js` (the `postinstall` script), which applies
  `patches/` with `patch-package` and then runs the checks in `scripts/rn-patch-checks/`.
- The Choicely RN Gradle plugin (`com.choicely.sdk:android-rn-gradle`) runs the same script on
  every build. Point it here from your Android project's `gradle.properties`:

  ```properties
  choicelyRnAndroidDir=app-react-native/choicely-android
  ```

  It is a no-op while the stamp in `node_modules/.choicely-rn-patches` is current.

Setup guide: https://docs.choicely.com/android-advanced/react-native

These files mirror the patches Choicely's own Android builds use; update them together with
the library versions in `package.json`.
