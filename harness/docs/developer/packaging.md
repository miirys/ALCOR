# Packaging

The Language Server project is used in varying desktop and browser environments.
This document describes the different build targets.

To illustrate the build process we first [compile](#compile) our source code, we
then [bundle](#bundle) it for desktop and browser environments which expect
dependencies to be provided for them, and finally we [package](#package) a
standalone desktop executable for environments where NodeJS may not be available.

The standalone executable is produced with `bun build --compile`, which embeds
the Bun runtime into the binary.

```mermaid
flowchart TD
    %% Source Code
    subgraph Sources ["Source Files"]
        browser_src[Browser Entry Point<br>src/browser/main.ts]
        node_src[Node Entry Point<br>src/node/main.ts]
        wasm_src[Tree-Sitter WASM<br>node_modules/web-tree-sitter<br>vendor/grammars/*.wasm]
    end

    %% Tools and Commands
    subgraph BuildTools ["Build Tools & Commands"]
        tsc["tsc (TypeScript Compiler)<br>bun run compile"]
        esbuild_browser["esbuild (Browser)<br>bun run bundle:browser"]
        esbuild_desktop["esbuild (Desktop)<br>bun run bundle:desktop"]
        bun_compile["bun build --compile<br>scripts/compile_lsp_executables.sh"]
        package_sh["Asset staging<br>scripts/package.sh"]
        bun_pack["bun pm pack"]
        nuget_pack["NuGet Pack<br>scripts/release-nuget.sh"]
    end

    %% Build Artifacts
    subgraph IntermediateArtifacts ["Intermediate Artifacts"]
        js_out["TypeScript Output<br>out/**/*.js + .d.ts"]
        browser_bundle["Browser Bundle<br>out/browser/main-bundle.js"]
        node_bundle["Node Bundle<br>out/main-bundle-node.js"]
        wasm_out["WASM Assets<br>out/node/tree-sitter.wasm<br>out/vendor/grammars/*.wasm"]
    end

    %% Final Artifacts
    subgraph FinalArtifacts ["Final Artifacts"]
        npm_package["NPM Package<br>@gitlab-org/gitlab-lsp-*.tgz"]
        binaries["Platform-specific Binaries<br>bin/gitlab-lsp-*"]
        nuget_package["NuGet Package<br>GitLab.LanguageServer.*.nupkg"]
    end

    %% Deployment
    subgraph DeployTargets ["Deployment Targets"]
        deploy_npm["NPM Registry"]
        deploy_binaries["GitLab Releases<br>Package Registry"]
        deploy_nuget["NuGet Registry"]
    end

    %% Connections
    browser_src --> esbuild_browser
    node_src --> esbuild_desktop
    wasm_src --> esbuild_browser & esbuild_desktop

    tsc --> js_out

    esbuild_browser --> browser_bundle
    esbuild_desktop --> node_bundle
    esbuild_browser & esbuild_desktop --> wasm_out

    js_out & node_bundle --> bun_pack --> npm_package --> deploy_npm

    node_src --> bun_compile
    wasm_src --> bun_compile
    bun_compile --> package_sh
    wasm_out --> package_sh
    package_sh --> binaries --> deploy_binaries

    binaries --> nuget_pack --> nuget_package --> deploy_nuget

    %% Styling
    classDef default fontFamily:Arial,fontSize:12px

    %% Group styling
    classDef sourceFiles fill:#e6f7ff,stroke:#1890ff,stroke-width:2px
    classDef buildTools fill:#f6ffed,stroke:#52c41a,stroke-width:2px
    classDef intermediateArtifacts fill:#fffbe6,stroke:#faad14,stroke-width:2px
    classDef finalArtifacts fill:#fff2f0,stroke:#ff4d4f,stroke-width:2px
    classDef deployTargets fill:#f9f0ff,stroke:#722ed1,stroke-width:2px

    %% Apply styles to subgraphs
    class Sources sourceFiles
    class BuildTools buildTools
    class IntermediateArtifacts intermediateArtifacts
    class FinalArtifacts finalArtifacts
    class DeployTargets deployTargets

    %% Link styling
    linkStyle default stroke:#999,stroke-width:1.5px,fill:none
```

## Compile

The `bun run compile` script typechecks TypeScript code and emits types used by downstream consumers.
Project configurations and shared options can be found in `tsconfig.json` and
`tsconfig.shared.json`.

## Bundle

The `bun run bundle` script invokes `bundle:desktop` and `bundle:browser` which invoke `esbuild`
with the appropriate platform and esbuild options.

The language server assumes that `path.join(__dirname, '../../../vendor/grammars/tree-sitter-<LANGUAGE>.wasm')` resolves to a readable path at runtime.

## Package

The `mise run package-binaries` task invokes `./scripts/package.sh`, which builds
standalone executables that don't require users to bring their own runtime.

## Tree Sitter

We depend on the `web-tree-sitter` module to load `tree-sitter.wasm` and Web
Assembly language grammars.

The [decision](https://gitlab.com/groups/gitlab-org/-/epics/11568#note_1654589370)
was made to use `.wasm` over native extensions to keep consistency between our
different extensions.

We include these as assets in the desktop and browser builds.
