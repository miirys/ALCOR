import {
  scanGemfileLock,
  scanPackageJSON,
  scanGoMod,
  scanPythonPoetry,
  scanPythonPip,
  scanPythonConda,
  scanPHPComposer,
  scanPomXML,
  scanBuildGradle,
  scanCSharpProject,
  scanCppConanTxt,
  scanCppConanPy,
  scanVcpkgJSON,
} from './parser';

describe('Dependency File Parsers', () => {
  test('scanGemfileLock', () => {
    const content = `
GEM
  remote: https://rubygems.org/
  specs:
    rake (13.0.6)

PLATFORMS
  ruby

DEPENDENCIES
  rake (~> 13.0)

BUNDLED WITH
   2.2.33
    `;
    const result = scanGemfileLock(content);
    expect(result).toEqual([{ name: 'rake', version: '(~> 13.0)' }]);
  });

  test('scanPackageJSON', async () => {
    const content = `
{
  "dependencies": {
    "react": "^17.0.2",
    "react-dom": "^17.0.2"
  },
  "devDependencies": {
    "typescript": "^4.4.3"
  }
}
    `;
    const result = await scanPackageJSON(content);
    expect(result).toEqual([
      { name: 'react', version: '^17.0.2' },
      { name: 'react-dom', version: '^17.0.2' },
      { name: 'typescript', version: '^4.4.3' },
    ]);
  });

  test('scanGoMod', () => {
    const content = `
module example.com/myproject

go 1.16

require (
	github.com/gin-gonic/gin v1.7.4
	github.com/go-playground/validator/v10 v10.9.0
)
    `;
    const result = scanGoMod(content);
    expect(result).toEqual([
      { name: 'github.com/gin-gonic/gin', version: 'v1.7.4' },
      { name: 'github.com/go-playground/validator/v10', version: 'v10.9.0' },
    ]);
  });

  test('scanPythonPoetry', () => {
    const content = `
[tool.poetry.dependencies]
python = "^3.9"
requests = "^2.26.0"

[tool.poetry.dev-dependencies]
pytest = "^6.2.5"
    `;
    const result = scanPythonPoetry(content);
    expect(result).toEqual([
      { name: 'python', version: '^3.9' },
      { name: 'requests', version: '^2.26.0' },
      { name: 'pytest', version: '^6.2.5' },
    ]);
  });

  test('scanPythonPip', () => {
    const content = `
requests==2.26.0
Flask==2.0.1
# This is a comment
pytest==6.2.5
    `;
    const result = scanPythonPip(content);
    expect(result).toEqual([
      { name: 'requests', version: '2.26.0' },
      { name: 'Flask', version: '2.0.1' },
      { name: 'pytest', version: '6.2.5' },
    ]);
  });

  test('scanPythonConda', () => {
    const content = `
name: myenv
channels:
  - conda-forge
  - defaults
dependencies:
  - python=3.9
  - numpy=1.21
  - pandas=1.3
    `;
    const result = scanPythonConda(content);
    expect(result).toEqual([
      { name: 'python', version: '3.9' },
      { name: 'numpy', version: '1.21' },
      { name: 'pandas', version: '1.3' },
    ]);
  });

  test('scanPHPComposer', async () => {
    const content = `
{
  "require": {
    "php": "^7.4",
    "laravel/framework": "^8.0"
  },
  "require-dev": {
    "phpunit/phpunit": "^9.0"
  }
}
    `;
    const result = await scanPHPComposer(content);
    expect(result).toEqual([
      { name: 'php', version: '^7.4' },
      { name: 'laravel/framework', version: '^8.0' },
      { name: 'phpunit/phpunit', version: '^9.0' },
    ]);
  });

  test('scanPomXML', async () => {
    const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>2.5.5</version>
    </dependency>
  </dependencies>
</project>
    `;
    const result = await scanPomXML(content);
    expect(result).toEqual([{ name: 'spring-boot-starter-web', version: '2.5.5' }]);
  });

  test('scanBuildGradle', () => {
    const content = `
plugins {
    id 'java'
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web:2.5.5'
    testImplementation 'junit:junit:4.13.2'
}
    `;
    const result = scanBuildGradle(content);
    expect(result).toEqual([
      { name: 'org.springframework.boot:spring-boot-starter-web', version: '2.5.5' },
      { name: 'junit:junit', version: '4.13.2' },
    ]);
  });

  test('scanCSharpProject', async () => {
    const content = `
<Project Sdk="Microsoft.NET.SDK">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.1" />
    <PackageReference Include="Microsoft.AspNetCore.App" Version="2.2.8" />
  </ItemGroup>
</Project>
    `;
    const result = await scanCSharpProject(content);
    expect(result).toEqual([
      { name: 'Newtonsoft.Json', version: '13.0.1' },
      { name: 'Microsoft.AspNetCore.App', version: '2.2.8' },
    ]);
  });

  test('scanCppConanTxt', () => {
    const content = `
[requires]
boost/1.76.0
eigen/3.4.0
[generators]
cmake
    `;
    const result = scanCppConanTxt(content);
    expect(result).toEqual([
      { name: 'boost', version: '1.76.0' },
      { name: 'eigen', version: '3.4.0' },
    ]);
  });

  test('scanCppConanPy', () => {
    const content = `
from conans import ConanFile

class MyConan(ConanFile):
    requires = (
        "boost/1.76.0",
        "eigen/3.4.0"
    )

    def requirements(self):
        self.requires("zlib/1.2.11")
    `;
    const result = scanCppConanPy(content);
    expect(result).toEqual([
      { name: 'boost', version: '1.76.0' },
      { name: 'eigen', version: '3.4.0' },
      { name: 'zlib', version: '1.2.11' },
    ]);
  });

  test('scanVcpkgJSON', () => {
    const content = `
{
  "name": "my-project",
  "dependencies": [
    "boost",
    {
      "name": "fmt",
      "version": "7.1.3#1"
    }
  ],
  "test-dependencies": [
    "gtest",
    "testlib@1.2.3"
  ]
}
    `;
    const result = scanVcpkgJSON(content);
    expect(result).toEqual([
      { name: 'boost', version: '' },
      { name: 'fmt', version: '7.1.3#1' },
      { name: 'gtest', version: '' },
      { name: 'testlib', version: '1.2.3' },
    ]);
  });
});
