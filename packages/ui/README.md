# @pagebridge/ui

Shared React component library for PageBridge applications.

## Installation

This is a private workspace package. It is not published to npm and is only available within the monorepo.

```typescript
// In package.json
{
  "dependencies": {
    "@pagebridge/ui": "workspace:^"
  }
}
```

## Usage

Components are exported directly from source files:

```typescript
import { Button } from '@pagebridge/ui/button';
import { Card } from '@pagebridge/ui/card';
import { Code } from '@pagebridge/ui/code';
```

## Components

### Button

Basic button component with click handling.

```typescript
import { Button } from '@pagebridge/ui/button';

function App() {
  return (
    <Button appName="MyApp" className="custom-class">
      Click me
    </Button>
  );
}
```

Props:
- `children` - Button content
- `className` - Additional CSS classes
- `appName` - Application name for click feedback

### Card

Link card component for navigation.

```typescript
import { Card } from '@pagebridge/ui/card';

function App() {
  return (
    <Card
      title="Documentation"
      href="https://example.com/docs"
      className="custom-class"
    >
      Learn more about the API
    </Card>
  );
}
```

Props:
- `title` - Card heading
- `children` - Card body content
- `href` - Link destination
- `className` - Additional CSS classes

### Code

Code display component for syntax highlighting.

```typescript
import { Code } from '@pagebridge/ui/code';

function App() {
  return <Code className="custom-class">{`const x = 1;`}</Code>;
}
```

## Dependencies

- `react` >= 19.0.0
- `react-dom` >= 19.0.0

## Development

Components are built with TypeScript and use the `"use client"` directive for Next.js compatibility.

To add a new component:

1. Create a new file in `src/` (e.g., `src/my-component.tsx`)
2. Export the component as the default or named export
3. Import it using `@pagebridge/ui/my-component`

## License

MIT
