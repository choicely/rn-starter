/**
 * react-native-video compiles against the Media3 version in its own gradle.properties (1.8.0
 * in 6.19.1), but an app runs whatever Media3 Gradle resolves for the whole app: the newest one
 * any module asks for, which is choicely-sdk's (1.9.2). Media3 1.9 removed the DefaultLoadControl
 * constructor that react-native-video's load control subclass calls, so on Android every video
 * crashed the app the moment it started (NoSuchMethodError: DefaultLoadControl.<init>, measured
 * 2026-10-31 in the Studio app). The build was green; only playback failed.
 *
 * patches/react-native-video+*.patch backports upstream's fix (react-native-video #5099,
 * released in 6.19.3): the load control wraps a DefaultLoadControl built with its Builder instead
 * of subclassing it, so no constructor signature is involved. This fails the build if that part
 * of the patch is lost. Drop the patch, and this check, when the RN workspaces move to 6.19.3 or
 * newer.
 *
 * Run by apply-rn-patches.js after it patches CHOICELY_RN_DIR.
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const RN_WORKSPACE = process.env.CHOICELY_RN_DIR
const VIDEO_DIR = path.dirname(
  require.resolve('react-native-video/package.json', { paths: [RN_WORKSPACE] }),
)
const VIEW_FILE = 'android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java'

describe('react-native-video plays on the Media3 the app resolves', () => {
  const view = fs.readFileSync(path.join(VIDEO_DIR, VIEW_FILE), 'utf8')

  it('never calls a DefaultLoadControl constructor', () => {
    assert.doesNotMatch(view, /extends DefaultLoadControl\b/)
    assert.match(view, /class RNVLoadControl implements LoadControl\b/)
    assert.match(view, /new DefaultLoadControl\.Builder\(\)/)
  })

  it('hands Media3 1.9+ the per-player allocator', () => {
    assert.match(view, /public Allocator getAllocator\(PlayerId playerId\)/)
  })
})
