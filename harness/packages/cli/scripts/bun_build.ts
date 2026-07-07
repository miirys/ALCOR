import { config } from './bun_build_config';

const productionConfig = {
  ...config,
  minify: true,
};
productionConfig.define.BUNDLER_INJECTED_ENVIRONMENT = "'production'";

const result = await Bun.build(productionConfig);

if (!result.success) {
  console.error('Build failed:', result.logs);
  process.exit(1);
}
