#!/usr/bin/env node

import { execa } from 'execa';

async function main() {
  try {
    // Check if blame.ignoreRevsFile is already set in local config
    try {
      const { stdout } = await execa('git', ['config', '--local', 'blame.ignoreRevsFile']);
      console.log(`blame.ignoreRevsFile is already set locally to: ${stdout}`);
      process.exit(0);
    } catch (error) {
      // Config not set, continue to set it
    }

    // Set the config
    await execa('git', ['config', '--local', 'blame.ignoreRevsFile', '.git-blame-ignore-revs']);
    console.log('Set blame.ignoreRevsFile to .git-blame-ignore-revs');
  } catch (error) {
    console.error('Error setting git blame ignore config:', error.message);
    process.exit(1);
  }
}

main();
