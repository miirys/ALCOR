# `@gitlab-org/duo-plugin-marketplace`

A **plugin marketplace** is a directory (typically a Git repo) containing a
`marketplace.json` catalog. The catalog references **plugins** — collections of
skills, hooks, MCP servers, and other capabilities — and says where to fetch
each.

For compatibility with the existing plugin marketplace ecosystem, we discover
`./.claude-plugin/marketplace.json` in addition to `./marketplace.json`

## Config files

Each config file maps to a schema declared in this package (shown in `( )`).
`marketplace.json` and `plugin.json` are third-party-authored. `plugins.json`
is user-authored (and committable). The rest are written by this package.

```text
<duoConfigDir>/                          # ~/.config/gitlab/duo (or ~/.gitlab/duo)
├── known_marketplaces.json              # registry of fetched marketplaces (KnownMarketplacesFileSchema)
├── installed_plugins.json               # global install ledger (InstalledPluginsFileSchema)
├── plugins.json                         # user-scope enabled plugins + known marketplaces (PluginsConfigFileSchema)
├── marketplaces/<marketplace>/
│   └── marketplace.json                 # a fetched catalog, third-party (MarketplaceCatalogSchema)
└── plugins/                             # cache of installed plugin artifacts
    └── <marketplace>/<plugin>/<version>/
        ├── plugin.json                  # a plugin's manifest, third-party (PluginManifestSchema)
        └── skills/<skill>/SKILL.md       # installed plugin artifacts

<workspace>/.gitlab/duo/
├── plugins.json                         # workspace-scope, committed (PluginsConfigFileSchema)
└── plugins.local.json                   # workspace-scope, gitignored (PluginsConfigFileSchema)
```

Note: the third-party-authored schemas (`marketplace.json`, `plugin.json`) and
`plugins.json` are validated `.loose()` to allow additional properties we don't
yet support.
