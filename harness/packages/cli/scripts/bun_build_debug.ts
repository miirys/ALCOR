import { config } from './bun_build_config';

const devConfig = {
  ...config,
  minify: false,
};

devConfig.define.BUNDLER_INJECTED_ENVIRONMENT = "'development'";

const result = await Bun.build(devConfig);

if (!result.success) {
  console.error('Build failed:', result.logs);
  process.exit(1);
}

console.log('Debug build completed successfully');
