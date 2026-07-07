import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  copyFileSync,
} from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';
import { buildLanguageServer, buildBrowserE2ETests } from './esbuild/browser_common.js';
import { minimatch } from 'minimatch';

function log(message: string, color?: 'red' | 'green' | 'yellow'): void {
  switch (color) {
    case 'red':
      console.log(chalk.red(message));
      break;
    case 'green':
      console.log(chalk.green(message));
      break;
    case 'yellow':
      console.log(chalk.yellow(message));
      break;
    default:
      console.log(message);
  }
}

function exitWithError(message: string): never {
  log(`Error: ${message}`, 'red');
  process.exit(1);
}

function copyFiles(sourceDir: string, targetDir: string, pattern: string): void {
  if (!existsSync(sourceDir)) {
    return;
  }

  try {
    readdirSync(sourceDir, { recursive: true, encoding: 'utf8' })
      .filter((filePath) => minimatch(filePath, pattern))
      .forEach((filePath) => {
        copyFileSync(join(sourceDir, filePath), join(targetDir, filePath));
      });
  } catch (error) {
    exitWithError((error as Error).message);
  }
}

async function main(): Promise<void> {
  log('Preparing browser e2e tests...', 'yellow');

  // Get script directory and project root
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(scriptDir, '..');

  // Change to project root for consistent path resolution
  process.chdir(projectRoot);

  // Paths
  const mochaPath = join(projectRoot, 'node_modules/mocha');
  const browserTestDir = join(projectRoot, 'src/tests/browser');
  const outputDir = join(projectRoot, 'tmp/tests/browser');
  const tsconfigPath = join(browserTestDir, 'tsconfig.json');

  // Check if tsconfig.json exists
  if (!existsSync(tsconfigPath)) {
    exitWithError(`tsconfig.json not found at ${tsconfigPath}`);
  }

  // Check if browser test directory exists
  if (!existsSync(browserTestDir)) {
    exitWithError(`Browser test directory not found at ${browserTestDir}`);
  }

  // Create output directory
  log(`Creating output directory: ${outputDir}`, 'yellow');
  mkdirSync(outputDir, { recursive: true });

  // Step 1: Build browser language server using programmatic API
  log('Step 1: Building browser language server...', 'yellow');
  try {
    await buildLanguageServer();
    log('Browser bundling completed successfully', 'green');
  } catch (error) {
    log('Browser bundling failed', 'red');
    process.exit(1);
  }

  // Step 2: Copy browser bundle files and tree-sitter grammars to tmp directory
  log('Step 2: Copying browser bundle files...', 'yellow');
  const browserOutDir = join(projectRoot, 'out/browser');
  const vendorOutDir = join(projectRoot, 'out/vendor');

  // Check if out/browser directory exists
  if (!existsSync(browserOutDir)) {
    exitWithError(`Browser output directory not found at ${browserOutDir}`);
  }

  if (!existsSync(vendorOutDir)) {
    exitWithError(`Vendor output directory not found at ${vendorOutDir}`);
  }

  // Remove vendor directory if it exists
  const outputVendorDir = join(outputDir, 'vendor');

  if (existsSync(outputVendorDir)) {
    rmSync(outputVendorDir, { recursive: true, force: true });
  }

  mkdirSync(join(outputVendorDir, 'grammars'), { recursive: true });

  // Copy .js, .js.map, and .wasm files
  copyFiles(mochaPath, outputDir, 'mocha.js');
  copyFiles(mochaPath, outputDir, 'mocha.css');
  copyFiles(browserOutDir, outputDir, '*.js');
  copyFiles(browserOutDir, outputDir, '*.js.map');
  copyFiles(browserOutDir, outputDir, '*.wasm');
  copyFiles(vendorOutDir, outputVendorDir, '**/*.wasm');

  log('Browser bundle files copied successfully', 'green');

  // Step 3: Process index.html template with environment variables
  log('Step 3: Processing index.html template...', 'yellow');
  const indexHtmlPath = join(browserTestDir, 'index.html');

  // Check if index.html exists
  if (!existsSync(indexHtmlPath)) {
    exitWithError(`index.html not found at ${indexHtmlPath}`);
  }

  // Check if required environment variables are set
  const gitlabUrl = process.env.GITLAB_URL || process.env.CI_SERVER_URL;
  const gitlabTestToken = process.env.GITLAB_TEST_TOKEN;
  const gitlabProjectPath = process.env.GITLAB_PROJECT_PATH;

  if (!gitlabUrl) {
    exitWithError('GITLAB_URL environment variable is not set');
  }

  if (!gitlabTestToken) {
    exitWithError('GITLAB_TEST_TOKEN environment variable is not set');
  }

  if (!gitlabProjectPath) {
    exitWithError('GITLAB_PROJECT_PATH environment variable is not set');
  }

  // Copy index.html to output directory and replace placeholders
  const indexHtmlContent = readFileSync(indexHtmlPath, 'utf8');
  const processedContent = indexHtmlContent
    .replace(/{{GITLAB_URL}}/g, gitlabUrl)
    .replace(/{{GITLAB_TEST_TOKEN}}/g, gitlabTestToken)
    .replace(/{{GITLAB_PROJECT_PATH}}/g, gitlabProjectPath);

  writeFileSync(join(outputDir, 'index.html'), processedContent);

  log('index.html processed with environment variables successfully', 'green');

  // Step 4: Run TypeScript compiler on browser tests
  log('Step 4: Running TypeScript compiler on browser tests...', 'yellow');
  try {
    execSync(`tsc -p "${tsconfigPath}" --noEmit`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    log('TypeScript compilation completed successfully', 'green');
  } catch (error) {
    log('TypeScript compilation failed', 'red');
    process.exit(1);
  }

  // Step 5: Build TypeScript test files using esbuild programmatic API
  log('Step 5: Building TypeScript test files...', 'yellow');

  try {
    await buildBrowserE2ETests(browserTestDir, outputDir);
    log('esbuild compilation completed successfully', 'green');
    log(`Output files are available in: ${outputDir}`, 'green');
  } catch (error) {
    log('esbuild compilation failed', 'red');
    process.exit(1);
  }

  log('Browser e2e test preparation completed successfully!', 'green');
}

// Run main function
main().catch((error) => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});
