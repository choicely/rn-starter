/**
 * FastImage starts its Glide request when its native view gets its props. On the new
 * architecture that is before the view is laid out, and FastImage passes Glide no size, so
 * Glide reads the 0x0 WRAP_CONTENT view as a request for an image the size of the screen's
 * longest side and centre-crops into it (logcat: "Glide treats LayoutParams.WRAP_CONTENT as a
 * request for an image the size of this device's screen dimensions", once per image). Measured
 * 2026-10-30 on a Galaxy S25 Ultra: each 300x450 poster became a ~39 MB bitmap and opening one
 * screen of them took the Studio app from 734 MB to 1.8 GB. Every bundle already in the field
 * renders <Image> through FastImage, so the host must never do that.
 *
 * patches/@d11+react-native-fast-image+*.patch defers the request to the view's first layout and
 * gives a request whose view has a 0 dimension an explicit size that never upscales. This fails
 * the build if that part of the patch is lost.
 *
 * Run by apply-rn-patches.js after it patches CHOICELY_RN_DIR.
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const RN_WORKSPACE = process.env.CHOICELY_RN_DIR
const FAST_IMAGE_DIR = path.dirname(
  require.resolve('@d11/react-native-fast-image/package.json', { paths: [RN_WORKSPACE] }),
)
const VIEW_FILE = 'android/src/main/java/com/dylanvann/fastimage/FastImageViewWithUrl.java'

describe('FastImage never asks Glide for a screen-sized image', () => {
  const view = fs.readFileSync(path.join(FAST_IMAGE_DIR, VIEW_FILE), 'utf8')

  it('waits for the first layout before starting a request', () => {
    assert.match(view, /if \(!mHasLayout\) \{[^}]*mPendingManager = manager;/)
    assert.match(view, /protected void onLayout\([^)]*\) \{[\s\S]*?mHasLayout = true;[\s\S]*?onAfterUpdate\(/)
  })

  it('sizes a request whose view has a 0 dimension without upscaling', () => {
    assert.match(view, /\.apply\(withLaidOutSize\(FastImageViewConverter\s*\.getOptions\(/)
    assert.ok(view.includes('.downsample(DownsampleStrategy.CENTER_INSIDE)'))
    assert.ok(view.includes('options.isTransformationSet() ? options : options.dontTransform()'))
  })
})
