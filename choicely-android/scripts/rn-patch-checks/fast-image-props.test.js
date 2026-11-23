/**
 * Every customer bundle renders <Image> through @d11/react-native-fast-image, and bundles
 * already in the field pass values FastImage does not know: React Native Image's own
 * `source.cache` ('force-cache', ...) and `resizeMode` ('repeat', 'none'), and anything else
 * the AI Editor writes. Unpatched, FastImage's codegen spec types those props as enums, so
 * codegen emits a C++ props parser that calls abort() on any other string — the whole app
 * process dies (SIGABRT on the JS thread) the moment such an image renders. Measured on
 * Studio Android 3.0.15, 2026-10-21; customer APKs carry the same generated code.
 *
 * patches/@d11+react-native-fast-image+*.patch makes every one of them a plain string and maps
 * it in the native view, falling back to the prop's default for anything unknown. This runs
 * the very codegen the Android build runs over the installed spec, so a lost patch (FastImage
 * bumped without porting it) or a new enum prop fails the build instead of a user's app.
 * The iOS half of the patch lives in the iOS engine's workspace, which checks its own.
 *
 * Run by apply-rn-patches.js after it patches CHOICELY_RN_DIR.
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const RN_WORKSPACE = process.env.CHOICELY_RN_DIR
const resolveInWorkspace = (request) => require.resolve(request, { paths: [RN_WORKSPACE] })
const RN_DIR = path.dirname(resolveInWorkspace('react-native/package.json'))
const FAST_IMAGE_DIR = path.dirname(resolveInWorkspace('@d11/react-native-fast-image/package.json'))
const SPEC_FILE = path.join(FAST_IMAGE_DIR, 'src/FastImageViewNativeComponent.ts')
const ANDROID_CONVERTER = 'android/src/main/java/com/dylanvann/fastimage/FastImageViewConverter.java'
const codegen = (lib) => require(require.resolve(`@react-native/codegen/lib/${lib}`, { paths: [RN_DIR] }))

const read = (relativePath) => fs.readFileSync(path.join(FAST_IMAGE_DIR, relativePath), 'utf8')

// Each former enum prop: where it sits in the schema, and the C++ field codegen must emit.
const STRING_PROPS = [
  { name: 'source.cache', path: ['source', 'cache'], field: 'std::string cache{std::string{"web"}};' },
  { name: 'source.priority', path: ['source', 'priority'], field: 'std::string priority{std::string{"normal"}};' },
  { name: 'resizeMode', path: ['resizeMode'], field: 'std::string resizeMode{std::string{"cover"}};' },
  { name: 'transition', path: ['transition'], field: 'std::string transition{std::string{"none"}};' },
]

function parseSpec() {
  const { TypeScriptParser } = codegen('parsers/typescript/parser')
  return new TypeScriptParser().parseFile(SPEC_FILE)
}

function generatedPropsHeader(schema) {
  const files = codegen('generators/components/GeneratePropsH').generate('RNFastImageSpec', schema, '', false, '')
  return [...files.values()].join('\n')
}

function componentProps(schema) {
  return schema.modules.FastImageView.components.FastImageView.props
}

function propAt(props, [name, ...rest]) {
  const prop = props.find((candidate) => candidate.name === name)
  return rest.length === 0 ? prop : propAt(prop.typeAnnotation.properties, rest)
}

// Every string-enum annotation anywhere in the component's props, by dotted path.
function stringEnumPaths(props, prefix = '') {
  return props.flatMap((prop) => {
    const name = `${prefix}${prop.name}`
    const annotation = prop.typeAnnotation
    if (annotation.type === 'StringEnumTypeAnnotation') return [name]
    if (annotation.properties) return stringEnumPaths(annotation.properties, `${name}.`)
    return []
  })
}

describe('FastImage props tolerate any string', () => {
  const schema = parseSpec()

  it('has no enum prop left in the codegen schema', () => {
    assert.deepEqual(stringEnumPaths(componentProps(schema)), [])
  })

  for (const { name, path: propPath } of STRING_PROPS) {
    it(`${name} is a string with a default`, () => {
      const prop = propAt(componentProps(schema), propPath)
      assert.equal(prop.optional, true)
      assert.equal(prop.typeAnnotation.type, 'StringTypeAnnotation')
      assert.equal(typeof prop.typeAnnotation.default, 'string')
    })
  }

  it('generates C++ string fields and no parser that aborts', () => {
    const header = generatedPropsHeader(schema)
    for (const { field } of STRING_PROPS) assert.ok(header.includes(field), `missing ${field}`)
    assert.doesNotMatch(header, /\babort\(\)/)
  })

  it("maps React Native Image's names and falls back instead of throwing on Android", () => {
    const android = read(ANDROID_CONVERTER)
    assert.ok(android.includes('put("force-cache", FastImageCacheControl.IMMUTABLE);'))
    assert.ok(android.includes('put("only-if-cached", FastImageCacheControl.CACHE_ONLY);'))
    assert.ok(android.includes('put("repeat", ScaleType.CENTER_INSIDE);'))
    assert.ok(android.includes('put("none", ScaleType.CENTER_INSIDE);'))
    assert.ok(!android.includes('throw new'))
  })
})
