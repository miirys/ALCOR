import * as yaml from 'js-yaml';
import { XMLParser } from 'fast-xml-parser';
import { DependencyLibrary, DependencyType } from './types';

type ScanFunction = (content: string) => DependencyLibrary[] | Promise<DependencyLibrary[]>;

// Utility functions
const splitLines = (content: string): string[] => content.split('\n');

const parseDependency = (line: string, separator: string = '/'): DependencyLibrary => {
  const [name, ...version] = line.trim().split(separator);
  return { name: name.trim(), version: (version.join(separator) || '').trim() };
};

const scanBySection = (
  lines: string[],
  startCondition: (line: string) => boolean,
  endCondition: (line: string) => boolean,
  parseLine: (line: string) => DependencyLibrary | null,
): DependencyLibrary[] => {
  const deps: DependencyLibrary[] = [];
  let inSection = false;

  for (const line of lines) {
    if (!inSection && startCondition(line)) {
      inSection = true;
    } else if (inSection && endCondition(line)) {
      inSection = false;
    } else if (inSection) {
      const dep = parseLine(line);
      if (dep?.name) deps.push(dep);
    }
  }

  return deps;
};

const parseJSONDependencies = async (
  content: string,
  keys: string[],
): Promise<DependencyLibrary[]> => {
  const json = JSON.parse(await content);
  return keys.flatMap((key) =>
    Object.entries(json[key] || {}).map(([name, version]) => ({
      name,
      version: version as string,
    })),
  );
};

// Scanning functions
export const scanGemfileLock: ScanFunction = (content) =>
  scanBySection(
    splitLines(content),
    (line) => line === 'DEPENDENCIES',
    (line) => line === '',
    (line) => parseDependency(line, ' '),
  );

export const scanPackageJSON: ScanFunction = (content) =>
  parseJSONDependencies(content, ['dependencies', 'devDependencies']);

export const scanGoMod: ScanFunction = (content) =>
  scanBySection(
    splitLines(content),
    (line) => line.startsWith('require'),
    (line) => line === ')',
    (line) => {
      if (line.startsWith('require ')) {
        return parseDependency(line.replace('require ', ''), ' ');
      }
      return parseDependency(line.trim(), ' ');
    },
  );

export const scanPythonPoetry: ScanFunction = (content) =>
  scanBySection(
    splitLines(content),
    (line) => line.startsWith('[tool.poetry') && line.endsWith('dependencies]'),
    (line) => line === '',
    (line) => {
      const [name, version] = line.split('=').map((s) => s.trim().replace(/"/g, ''));
      return { name, version };
    },
  );

export const scanPythonPip: ScanFunction = (content) =>
  splitLines(content)
    .filter((line) => line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('-r'))
    .map((line) => parseDependency(line.split('#')[0].trim(), '=='));

export const scanPythonConda: ScanFunction = (content) => {
  const parsedYaml = yaml.load(content) as { dependencies: string[] };
  return parsedYaml.dependencies
    .filter((dep): dep is string => typeof dep === 'string')
    .map((dep) => parseDependency(dep, '='));
};

export const scanPHPComposer: ScanFunction = (content) =>
  parseJSONDependencies(content, ['require', 'require-dev']);

export const scanPomXML: ScanFunction = (content) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const result = parser.parse(content);
  let dependencies = result.project?.dependencies?.dependency || [];
  dependencies = Array.isArray(dependencies) ? dependencies : [dependencies];
  return dependencies.map((dep: { artifactId: string; version: string }) => ({
    name: dep.artifactId,
    version: dep.version,
  }));
};

export const scanBuildGradle: ScanFunction = (content) =>
  scanBySection(
    splitLines(content),
    (line) => line.startsWith('dependencies {'),
    (line) => line === '}',
    (line) => {
      const match = line.match(/(\w+)\s*\(?['"](.+):(.+):(.+)['"]\)?/);
      return match ? { name: `${match[2]}:${match[3]}`, version: match[4] } : null;
    },
  );

export const scanCSharpProject: ScanFunction = (content) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const result = parser.parse(content);
  let itemGroups = result.Project?.ItemGroup;
  itemGroups = Array.isArray(itemGroups) ? itemGroups : [itemGroups];
  const packageReferences =
    itemGroups.find((group: { PackageReference: never }) => group.PackageReference)
      ?.PackageReference || [];
  return packageReferences.map((dep: { '@_Include': string; '@_Version': string }) => ({
    name: dep['@_Include'],
    version: dep['@_Version'],
  }));
};

export const scanCppConanTxt: ScanFunction = (content) =>
  scanBySection(
    splitLines(content),
    (line) => line.startsWith('[requires]'),
    (line) => line.startsWith('['),
    (line) => (line && !line.startsWith('#') ? parseDependency(line) : null),
  );

export const scanCppConanPy: ScanFunction = (content) =>
  scanBySection(
    splitLines(content),
    (line) => line.trim().startsWith('requires ='),
    (line) => line.trim().startsWith(')'),
    (line) => {
      const match = line.trim().match(/["'](.+)\/(.+)["']/);
      return match ? { name: match[1], version: match[2] } : null;
    },
  ).concat(
    splitLines(content)
      .filter((line) => line.trim().startsWith('self.requires('))
      .map((line) => {
        const match = line.match(/self\.requires\("(.+)\/(.+)"\)/);
        return match ? { name: match[1], version: match[2] } : null;
      })
      .filter((dep): dep is DependencyLibrary => dep !== null),
  );

type vcPkgDependency = { name: string; version?: string } | string;

export const scanVcpkgJSON: ScanFunction = (content) => {
  const data = JSON.parse(content);
  const processDependencies = (deps: vcPkgDependency[]): DependencyLibrary[] =>
    deps.map((dep) =>
      typeof dep === 'string'
        ? parseDependency(dep, '@')
        : { name: dep?.name, version: dep?.version || '' },
    );

  return [
    ...processDependencies(data.dependencies || []),
    ...processDependencies(data['test-dependencies'] || []),
  ];
};

export async function parseDependencyFile(
  type: DependencyType,
  content: Promise<string>,
): Promise<DependencyLibrary[]> {
  switch (type.type) {
    case 'ruby':
      return scanGemfileLock(await content);
    case 'javascript':
      return scanPackageJSON(await content);
    case 'go':
      return scanGoMod(await content);
    case 'poetry':
      return scanPythonPoetry(await content);
    case 'pip':
      return scanPythonPip(await content);
    case 'conda':
      return scanPythonConda(await content);
    case 'php':
      return scanPHPComposer(await content);
    case 'maven':
      return scanPomXML(await content);
    case 'gradle':
      return scanBuildGradle(await content);
    case 'csharp':
      return scanCSharpProject(await content);
    case 'conantxt':
      return scanCppConanTxt(await content);
    case 'conanpy':
      return scanCppConanPy(await content);
    case 'vcpkg':
      return scanVcpkgJSON(await content);
    default:
      return [];
  }
}
