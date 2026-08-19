# Choicely RN Starter

The React Native module you drop into a native Android app to render Choicely
React Native components.

Clone it as `app-react-native/` inside your Android project, install, bundle. The
Gradle wiring is documented at
[docs.choicely.com/android-advanced/react-native](https://docs.choicely.com/android-advanced/react-native).

```bash
cd Android/Java
git clone https://github.com/choicely/rn-starter.git app-react-native
cd app-react-native
npm install
npm run bundle
```

`npm run bundle` writes `../app/src/main/assets/index.android.bundle` — the exact
path the SDK loads when `ChoicelyRNConfig.serLoadRemoteBundle(context, false, appKey)`
is set. Re-run it after any JS change. For live reload during development use
`npm start` (Metro) instead.

## Requirements

Node >= 20, Java 17, Android SDK with CMake and NDK `27.1.12297006`.

## What your host app must provide

These are easy to miss and each one fails the build or the launch:

- `gradle.properties` — `newArchEnabled=true`, `hermesEnabled=true`, and
  `choicelyRnDir=app-react-native`.
- Root `build.gradle` `ext` — `ndkVersion`, plus `reactNativeAndroidRoot` and a
  `react-native` options map. Several community libraries (notifee, netinfo, blur,
  geolocation, pager-view) locate the React Native Android prebuilts by walking *up*
  from the Android root, which fails when `node_modules` lives inside this folder.
  The docs page has the exact block.
- `res/values/colors.xml` — `colorPrimary`, `colorPrimaryDark` and `colorAccent`.
  The Choicely SDK themes reference them and resource linking fails without them.
- `packagingOptions { pickFirst 'lib/**/libworklets.so' }` — reanimated and worklets
  both ship it.

## Components

`src/index.js` is the entry point and the registry. Add a component under
`src/components/`, register it, and the native side opens it by that registered name:

```js
import {AppRegistry} from 'react-native'
import Hello from './components/Hello'

AppRegistry.registerComponent('hello', () => Hello)
```

A name the host app asks for but that is not registered here fails at runtime with
`"<name>" has not been registered`, with no build-time error — so keep the two in sync.

Nothing else is done for you: if a component needs a gesture root, a safe-area
provider or an error boundary, wrap it yourself.

## Adding libraries

`npm install <package>` — React Native autolinking picks up native modules on the
next Gradle build. Native libraries that need build-time fixes go in `patches/`, applied
by `patch-package` on `postinstall`.

## Support status

This is a **frozen snapshot**, pinned to the published Choicely SDK artifacts:

| Artifact | Version |
| --- | --- |
| `com.choicely.sdk:android-core` | `1.1.2` |
| `com.choicely.sdk:android-rn` | `0.0.2` |
| `com.choicely.sdk:choicely-rn-gradle` | `0.0.4` |
| `react-native` | `0.82.0` |

It is verified against those versions and is not tracking ongoing internal
development. If you want to build and publish a Choicely app without writing code,
use [Choicely Studio](https://www.choicely.com) instead — that is the supported path.

## Licence

[Elastic License 2.0](LICENCE.md).
