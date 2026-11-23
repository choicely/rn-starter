#!/usr/bin/env node
// Applies this repo's patches/ to an RN workspace's node_modules.
//
//   node apply-rn-patches.js <rnDir>    (a no-op while the stamp in its node_modules is current)
//
// patches/ is the ONE copy of the Android-native patches every Android host builds with
// (artifact-template-android, the Studio app, enterprise apps). The RN workspaces carry
// no patches of their own; they only provide the patch-package tool. Three callers run
// this: scripts/setup.sh and the artifact builder right after `npm ci`, and the
// com.choicely.rn.setup Gradle plugin on every configuration as the backstop.
//
// After patching it runs rn-patch-checks/, which assert what a patch must achieve in the
// installed workspace. The stamp covers the patch files, the checks AND the workspace
// lockfile, so a new or edited patch is applied on the next run even when nothing was
// reinstalled. An edited patch cannot be applied over its older version: that fails with a
// request to run `npm ci`.
//
// The last line of a run is CHOICELY_RN_PATCHES_CHANGED=<packages> — the packages whose
// files this run modified. Gradle reads it, because a package it already compiled during
// settings (@react-native/gradle-plugin) only takes the patch on the next build.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PATCHES_DIR = path.resolve(__dirname, '..', 'patches');
// node:test files asserting what a patch must achieve in the installed workspace (which they
// read through CHOICELY_RN_DIR). Run after every apply; the stamp is written only if they pass.
const CHECKS_DIR = path.join(__dirname, 'rn-patch-checks');
const STAMP_FILE = path.join('node_modules', '.choicely-rn-patches');
const CHANGED_PREFIX = 'CHOICELY_RN_PATCHES_CHANGED=';
const PATCH_TARGET = /^diff --git a\/(node_modules\/(?:@[^/]+\/)?[^/]+)\/(\S+) b\//;

function fail(message) {
  console.error(`apply-rn-patches: ${message}`);
  process.exit(1);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function filesIn(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(suffix)).sort().map((name) => path.join(dir, name));
}

const patchFiles = () => filesIn(PATCHES_DIR, '.patch');
const checkFiles = () => filesIn(CHECKS_DIR, '.test.js');

function fingerprint(rnDir) {
  const hash = crypto.createHash('sha256');
  for (const file of [...patchFiles(), ...checkFiles()]) {
    hash.update(path.relative(__dirname, file)).update('\0').update(fs.readFileSync(file)).update('\0');
  }
  const lockfile = path.join(rnDir, 'package-lock.json');
  if (fs.existsSync(lockfile)) hash.update(fs.readFileSync(lockfile));
  return hash.digest('hex');
}

// Every file the patches touch, keyed by path relative to rnDir, with its package dir.
function patchTargets() {
  const targets = new Map();
  for (const file of patchFiles()) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = PATCH_TARGET.exec(line);
      if (match) targets.set(`${match[1]}/${match[2]}`, match[1].slice('node_modules/'.length));
    }
  }
  return targets;
}

function runChecks(rnRoot) {
  const checks = checkFiles();
  if (checks.length === 0) return;
  const run = spawnSync(process.execPath, ['--test', ...checks], {
    env: { ...process.env, CHOICELY_RN_DIR: rnRoot },
    stdio: 'inherit',
  });
  if (run.status !== 0) fail(`the patched workspace ${rnRoot} fails the checks in ${CHECKS_DIR}`);
}

function snapshot(rnDir, targets) {
  const hashes = new Map();
  for (const file of targets.keys()) {
    const full = path.join(rnDir, file);
    hashes.set(file, fs.existsSync(full) ? sha256(fs.readFileSync(full)) : null);
  }
  return hashes;
}

function main() {
  const [rnDir] = process.argv.slice(2);
  if (!rnDir) fail('usage: apply-rn-patches.js <rnDir>');
  const rnRoot = path.resolve(rnDir);
  if (!fs.existsSync(path.join(rnRoot, 'node_modules'))) fail(`no node_modules in ${rnRoot}; run \`npm ci\` there first`);

  // A workspace's own patches are the duplication this script replaced: they fork the Android
  // builds from each other again. Warn until choicely-rn and mobile-studio-rn have both dropped
  // theirs on main, then make this fail().
  if (filesIn(path.join(rnRoot, 'patches'), '.patch').length > 0) {
    console.warn(`apply-rn-patches: WARNING ${rnRoot}/patches holds patches of its own; native ` +
      `patches belong in ${PATCHES_DIR} only`);
  }

  const expected = fingerprint(rnRoot);

  const stampPath = path.join(rnRoot, STAMP_FILE);
  const stamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8').trim() : null;
  if (stamp === expected) {
    console.log(`apply-rn-patches: ${rnRoot} is up to date`);
    console.log(CHANGED_PREFIX);
    return;
  }

  const patchPackage = path.join(rnRoot, 'node_modules', 'patch-package', 'index.js');
  if (!fs.existsSync(patchPackage)) fail(`${rnRoot} has no patch-package; it must stay a devDependency of every RN workspace`);

  const targets = patchTargets();
  const before = snapshot(rnRoot, targets);
  // patch-package rejects an absolute --patch-dir and joins it onto the workspace root.
  const patchDir = path.relative(rnRoot, PATCHES_DIR) || '.';
  const run = spawnSync(process.execPath, [patchPackage, '--patch-dir', patchDir, '--error-on-fail', '--error-on-warn'], {
    cwd: rnRoot,
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    fail(`patching ${rnRoot} failed. A patch whose package version differs from the lockfile must be ` +
      're-made for the new version; a patch edited since it was last applied needs a clean ' +
      `install first: run \`npm ci\` in ${rnRoot} and build again.`);
  }

  const after = snapshot(rnRoot, targets);
  const changed = new Set();
  for (const [file, pkg] of targets) {
    if (before.get(file) !== after.get(file)) changed.add(pkg);
  }
  runChecks(rnRoot);
  fs.writeFileSync(stampPath, `${expected}\n`);
  console.log(`${CHANGED_PREFIX}${[...changed].sort().join(',')}`);
}

main();
