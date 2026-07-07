import { createRequire } from 'module';
import { dirname } from 'path';
import type { Config } from 'tailwindcss';

const requireFromCwd = createRequire(`${process.cwd()}/package.json`);

// should throw if base config not found
const tailwindDefaultsPath = requireFromCwd.resolve('@gitlab/ui/tailwind.defaults.js');
const tailwindDefaults = requireFromCwd(tailwindDefaultsPath) as Partial<Config>;

const content: string[] = [
  './src/**/*.{vue,js,html}',
  './node_modules/@gitlab/ui/dist/**/*.{vue,js}',
  './node_modules/@gitlab/duo-ui/dist/**/*.{vue,js}',
];

try {
  const agenticChatPkgJson = requireFromCwd.resolve(
    '@gitlab-org/lib-agentic-duo-chat/package.json',
  );
  const agenticChatRoot = dirname(agenticChatPkgJson);
  content.push(`${agenticChatRoot}/src/**/*.{vue,js}`);
} catch {
  // consumer does not depend on @gitlab-org/lib-agentic-duo-chat
}

export const tailwindConfig = {
  content,
  presets: [tailwindDefaults],
};
