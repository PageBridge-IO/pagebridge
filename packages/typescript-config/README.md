# @pagebridge/typescript-config

Shared TypeScript configurations for PageBridge packages.

## Installation

This is a private workspace package, available only within the monorepo.

```json
{
  "devDependencies": {
    "@pagebridge/typescript-config": "workspace:^"
  }
}
```

## Configurations

### base.json

Base configuration for all TypeScript projects.

```json
{
  "extends": "@pagebridge/typescript-config/base.json"
}
```

### library.json

Configuration for publishable library packages. Includes stricter settings and declaration file generation.

```json
{
  "extends": "@pagebridge/typescript-config/library.json"
}
```

### react-library.json

Configuration for React component libraries. Extends library config with JSX support.

```json
{
  "extends": "@pagebridge/typescript-config/react-library.json"
}
```

### nextjs.json

Configuration for Next.js applications.

```json
{
  "extends": "@pagebridge/typescript-config/nextjs.json"
}
```

## Usage

Create a `tsconfig.json` in your package:

```json
{
  "extends": "@pagebridge/typescript-config/library.json",
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
