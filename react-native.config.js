const fs = require("fs");
const path = require("path");

function getPackageNameFromGradle() {
  const gradlePath = path.join(__dirname, "..", "app", "build.gradle");
  const contents = fs.readFileSync(gradlePath, "utf8");
  const match = contents.match(/namespace\s*=?\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(`Could not find namespace in ${gradlePath}`);
  }
  return match[1];
}

module.exports = {
  project: {
    android: {
      sourceDir: "../",
      appName: "app",
      packageName: getPackageNameFromGradle(),
    },
  },
};
