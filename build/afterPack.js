// Ad-hoc code signature for the Mac app. Without any signature, Apple Silicon
// Macs refuse to launch it. This is not an Apple Developer signature, so users
// still need to clear the quarantine flag once (the Homebrew cask does that).
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
