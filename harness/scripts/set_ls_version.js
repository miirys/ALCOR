const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json to get the version
const packageJson = require('../package.json');
const version = packageJson.version;

// Sync CLI package version
const cliPackagePath = path.resolve(__dirname, '../packages/cli/package.json');
if (fs.existsSync(cliPackagePath)) {
  const cliPackage = require(cliPackagePath);
  cliPackage.version = version;
  fs.writeFileSync(cliPackagePath, JSON.stringify(cliPackage, null, 2) + '\n');
  console.log(`Synced CLI package version to ${version}.`);
  execSync(`git add ${cliPackagePath}`, { stdio: 'inherit' });
  execSync(`bun install --ignore-scripts`, { stdio: 'inherit' });
}
