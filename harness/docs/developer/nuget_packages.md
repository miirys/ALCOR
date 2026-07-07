# Nuget Packages

Language Server standalone binaries for Windows can be consumed as
Nuget packages from the Language Server package registry.

## Adding the Nuget Source

You can add the source as the new Nuget source to allow your projects
consume the packages:

```shell
https://gitlab.com/api/v4/projects/46519181/packages/nuget/index.json
```

Follow [instructions](https://docs.gitlab.com/user/packages/nuget_repository/#add-the-package-registry-as-a-source-for-nuget-packages) depending on your platform.

For IDE-specific instruction consult with the docs for your IDE.

## Consuming the Nuget package

Standalone binaries are added as the [Content Files](https://devblogs.microsoft.com/nuget/nuget-contentfiles-demystified/) to the Nuget package.

After you added the new Nuget Source you can reference the package in
your `.csproj` project file:

```xml
<ItemGroup>
    <PackageReference Include="GitLab.LanguageServer">
        <Version>7.4.3</Version>
    </PackageReference>
</ItemGroup>
```

All binaries from the package will be available under the `bin/` directory
of the build output.
