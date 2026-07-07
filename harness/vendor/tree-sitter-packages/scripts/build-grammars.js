const { execSync } = require('child_process');
const { copyFileSync, mkdirSync, writeFileSync, existsSync, statSync } = require('fs');
const path = require('path');

// Grammar definitions - build from npm packages
const GRAMMARS = [
  {
    name: 'scala',
    packagePath: 'tree-sitter-scala',
    version: 'v0.24.0',
  },
  {
    name: 'css',
    packagePath: 'tree-sitter-css',
    version: '^0.23.2',
  },
  {
    name: 'html',
    packagePath: 'tree-sitter-html',
    version: '^0.23.2',
  },
  {
    name: 'java',
    packagePath: 'tree-sitter-java',
    version: '^0.23.5',
  },
  {
    name: 'kotlin',
    packagePath: 'tree-sitter-kotlin',
    version: '^0.3.8',
  },
  {
    name: 'rust',
    packagePath: 'tree-sitter-rust',
    version: '^0.23.2',
  },
  {
    name: 'tsx',
    packagePath: 'tree-sitter-typescript',
    version: '^0.23.2',
  },
  {
    name: 'yaml',
    packagePath: '@tree-sitter-grammars/tree-sitter-yaml',
    version: '^0.7.0',
  },
  {
    name: 'cpp',
    packagePath: 'tree-sitter-cpp',
    version: '^0.23.4',
  },
  {
    name: 'go',
    packagePath: 'tree-sitter-go',
    version: '^0.23.4',
  },
  {
    name: 'javascript',
    packagePath: 'tree-sitter-javascript',
    version: '^0.23.0',
  },
  {
    name: 'json',
    packagePath: 'tree-sitter-json',
    version: '^0.24.8',
  },
  {
    name: 'python',
    packagePath: 'tree-sitter-python',
    version: '^0.23.6',
  },
  // Commented out - don't build on this architecture
  // {
  //   name: 'bash',
  //   packagePath: 'tree-sitter-bash',
  //   version: '^0.25.0',
  // },
  // {
  //   name: 'c',
  //   packagePath: 'tree-sitter-c',
  //   version: '^0.24.1',
  // },
  // {
  //   name: 'c_sharp',
  //   packagePath: 'tree-sitter-c-sharp',
  //   version: '^0.23.1',
  // },
  // {
  //   name: 'php',
  //   packagePath: 'tree-sitter-php',
  //   version: '^0.23.12',
  // },
  {
    name: 'powershell',
    packagePath: 'tree-sitter-powershell',
    version: 'github:airbus-cert/tree-sitter-powershell#e904962e25858b7e8e19c653e737ad3b7d1c55bd',
  },
  // {
  //   name: 'ruby',
  //   packagePath: 'tree-sitter-ruby',
  //   version: '^0.23.1',
  // },
  // {
  //   name: 'yaml-old',
  //   packagePath: 'tree-sitter-yaml',
  //   version: '^0.5.0',
  // },
  // {
  //   name: 'zig',
  //   packagePath: 'tree-sitter-zig',
  //   version: '^0.2.0',
  // },
  // {
  //   name: 'sql',
  //   packagePath: '@derekstride/tree-sitter-sql',
  //   version: '^0.3.8',
  // },
];

async function buildGrammar(grammar) {
  console.log(`Building ${grammar.name} grammar...`);

  try {
    const packagePath = path.join('node_modules', grammar.packagePath);

    if (!existsSync(packagePath)) {
      console.warn(
        `Skipping ${grammar.name}: package ${grammar.packagePath} not found in node_modules`,
      );
      return null;
    }

    // Build WASM using tree-sitter CLI
    const wasmFile = `tree-sitter-${grammar.name}.wasm`;
    console.log(`Building WASM for ${grammar.name}...`);

    try {
      execSync(`npx tree-sitter build --wasm ${packagePath}`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    } catch (buildError) {
      console.error(`Build failed for ${grammar.name}:`, buildError.message);
      return null;
    }

    if (!existsSync(wasmFile)) {
      throw new Error(`WASM file ${wasmFile} was not generated`);
    }

    return {
      name: grammar.name,
      wasmFile: wasmFile,
      version: grammar.version,
      size: statSync(wasmFile).size,
    };
  } catch (error) {
    console.error(`Error building ${grammar.name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Building tree-sitter grammars...');

  // Create output directory - write directly to project root vendor/grammars
  const outDir = path.resolve(process.cwd(), '..', '..', 'vendor', 'grammars');
  mkdirSync(outDir, { recursive: true });

  const results = [];

  // Build each grammar
  for (const grammar of GRAMMARS) {
    const result = await buildGrammar(grammar);
    if (result) {
      // Copy WASM file to output directory
      const outputPath = path.join(outDir, `tree-sitter-${result.name}.wasm`);
      copyFileSync(result.wasmFile, outputPath);

      // Clean up temporary file
      require('fs').unlinkSync(result.wasmFile);

      results.push({
        ...result,
        outputPath: path.relative(path.resolve(process.cwd(), '..', '..'), outputPath),
      });

      console.log(`✓ Built ${result.name} (${(result.size / 1024).toFixed(1)}KB)`);
    }
  }

  // Create manifest file
  const manifest = {
    version: require('../package.json').version,
    buildDate: new Date().toISOString(),
    grammars: results,
  };

  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\nBuilt ${results.length} grammars successfully!`);
  console.log(`Output directory: ${outDir}`);
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
