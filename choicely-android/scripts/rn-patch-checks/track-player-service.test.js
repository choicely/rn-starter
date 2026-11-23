/**
 * react-native-track-player 4.1.2's MusicService crashed every host that plays audio, twice over:
 *
 * - It sent each player event to JS through `reactNativeHost.reactInstanceManager`, which on
 *   React Native 0.82's New Architecture throws "ReactInstanceManager.createReactContext is
 *   unsupported". The first event after play() killed the app. Measured on Studio Android
 *   3.0.16, 2026-10-27: every one of that release's fatal crashes in Crashlytics.
 * - When the process died while the service was alive, Android restarted the sticky service
 *   with a null intent from the background, and its placeholder startForeground() threw
 *   ForegroundServiceStartNotAllowedException on Android 12+: the app crashed again on every
 *   restart and the user got "keeps stopping". Studio Android 3.0.12 and 3.0.15.
 *
 * patches/react-native-track-player+*.patch fixes both. This reads the patched service in the
 * workspace, so a track-player bump that drops the patch fails the build instead of the app.
 *
 * Run by apply-rn-patches.js after it patches CHOICELY_RN_DIR.
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const RN_WORKSPACE = process.env.CHOICELY_RN_DIR
const TRACK_PLAYER_DIR = path.dirname(
  require.resolve('react-native-track-player/package.json', { paths: [RN_WORKSPACE] }),
)
const ANDROID_SOURCES = path.join(TRACK_PLAYER_DIR, 'android/src/main/java')
const MUSIC_SERVICE = path.join(ANDROID_SOURCES, 'com/doublesymmetry/trackplayer/service/MusicService.kt')

function kotlinFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return kotlinFiles(entryPath)
    return entry.name.endsWith('.kt') ? [entryPath] : []
  })
}

// The body of `fun <name>(` up to the next top-level member of the class.
function functionBody(source, name) {
  const start = source.indexOf(`fun ${name}(`)
  assert.notEqual(start, -1, `MusicService has no fun ${name}`)
  const next = source.slice(start + 1).search(/\n {4}(@|override |private |public |internal |fun )/)
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next)
}

describe('track-player MusicService on the New Architecture', () => {
  const service = fs.readFileSync(MUSIC_SERVICE, 'utf8')

  it('never reaches JS through ReactInstanceManager', () => {
    for (const file of kotlinFiles(ANDROID_SOURCES)) {
      const source = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '')
      assert.doesNotMatch(source, /reactNativeHost\s*\.\s*reactInstanceManager/, path.relative(TRACK_PLAYER_DIR, file))
    }
  })

  it('emits events through the bridgeless-aware reactContext', () => {
    for (const name of ['emit', 'emitList']) {
      assert.match(functionBody(service, name), /\breactContext\s*\?\.\s*getJSModule/, name)
    }
  })

  it('stops instead of restarting sticky with a null intent', () => {
    const onStart = functionBody(service, 'onStartCommand')
    const nullGuard = onStart.indexOf('intent == null')
    assert.notEqual(nullGuard, -1)
    assert.ok(nullGuard < onStart.indexOf('startTask('), 'the null-intent guard must run before startTask')
    assert.match(onStart.slice(nullGuard), /stopSelf\(startId\)[\s\S]*return START_NOT_STICKY/)
  })

  it('survives a refused placeholder startForeground', () => {
    const placeholder = functionBody(service, 'startAndStopEmptyNotificationToAvoidANR')
    assert.match(placeholder, /try\s*\{\s*startForeground\([\s\S]*\}\s*catch\s*\(e: IllegalStateException\)/)
  })
})
