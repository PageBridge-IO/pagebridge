# @content-keep/typescript-config

Shared TypeScript configurations for Content Keep packages.

## Installation

This is a private workspace package, available only within the monorepo.

```json
{
  "devDependencies": {
    "@content-keep/typescript-config": "workspace:^"
  }
}
```

## Configurations

### base.json

Base configuration for all TypeScript projects.

```json
{
  "extends": "@content-keep/typescript-config/base.json"
}
```

### library.json

Configuration for publishable library packages. Includes stricter settings and declaration file generation.

```json
{
  "extends": "@content-keep/typescript-config/library.json"
}
```

### react-library.json

Configuration for React component libraries. Extends library config with JSX support.

```json
{
  "extends": "@content-keep/typescript-config/react-library.json"
}
```

### nextjs.json

Configuration for Next.js applications.

```json
{
  "extends": "@content-keep/typescript-config/nextjs.json"
}
```

## Usage

Create a `tsconfig.json` in your package:

```json
{
  "extends": "@content-keep/typescript-config/library.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## License

MIT
