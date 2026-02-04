# @content-keep/eslint-config

Shared ESLint configurations for Content Keep packages.

## Installation

This is a private workspace package, available only within the monorepo.

```json
{
  "devDependencies": {
    "@content-keep/eslint-config": "workspace:^"
  }
}
```

## Configurations

### base

Base configuration for all JavaScript/TypeScript projects.

```javascript
// eslint.config.js
import baseConfig from '@content-keep/eslint-config/base';

export default baseConfig;
```

### next

Configuration for Next.js applications. Extends the base configuration with Next.js-specific rules.

```javascript
// eslint.config.js
import nextConfig from '@content-keep/eslint-config/next';

export default nextConfig;
```

### react-internal

Configuration for internal React libraries. Extends the base configuration with React-specific rules.

```javascript
// eslint.config.js
import reactConfig from '@content-keep/eslint-config/react-internal';

export default reactConfig;
```

## License

MIT
