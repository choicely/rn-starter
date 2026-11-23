/**
 * react-native-video asks Android for AUDIOFOCUS_GAIN, a permanent gain. The app that was
 * playing (Spotify, a podcast) is told its loss is permanent, so it stops for good: when a
 * Choicely screen with an autoplaying video closed and gave focus back, the user's music never
 * resumed (measured 2026-11-02 in the Studio app's preview: `gain: GAIN` in `dumpsys audio`).
 *
 * patches/react-native-video+*.patch asks for AUDIOFOCUS_GAIN_TRANSIENT instead, so the music
 * app pauses and resumes when the video's view abandons focus. A muted video takes no focus at
 * all; unmuting takes it, muting gives it back. This fails the build if that part of the patch
 * is lost (upstream still asks for the permanent gain).
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

describe('react-native-video lets the user\'s music resume', () => {
  const view = fs.readFileSync(path.join(VIDEO_DIR, VIEW_FILE), 'utf8')

  it('asks for transient focus, never the permanent gain', () => {
    assert.match(view, /AudioManager\.AUDIOFOCUS_GAIN_TRANSIENT\)/)
    assert.doesNotMatch(view, /STREAM_MUSIC,\s*AudioManager\.AUDIOFOCUS_GAIN\)/)
  })

  it('takes no focus while muted', () => {
    assert.match(view, /if \(disableFocus \|\| muted \|\|/)
  })

  it('gives focus back when muted', () => {
    assert.match(view, /if \(changed && muted && hasAudioFocus\) \{\s*abandonAudioFocus\(\);/)
  })
})
