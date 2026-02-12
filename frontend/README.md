# KnowZero Frontend

React-based frontend for KnowZero AI Learning Platform.

## Features

- **React 18** + TypeScript - Modern React with type safety
- **Vite** - Fast development and building
- **TailwindCSS** - Utility-first CSS
- **Radix UI** - Unstyled, accessible components
- **Zustand** - Lightweight state management
- **TanStack Query** - Data fetching and caching
- **React Router v6** - Client-side routing

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The app will be available at http://localhost:5173

### 3. Build for Production

```bash
npm run build
```

## Project Structure

```
src/
├── api/              # API client
│   └── client.ts
├── components/       # React components
│   ├── Chat/        # Chat components
│   ├── DocumentView/# Document display
│   ├── Layout/      # Layout components
│   ├── Sidebar/     # Sidebar/Navigation
│   └── ui/          # UI primitives
├── lib/             # Utilities
│   └── utils.ts
├── pages/           # Page components
│   ├── HomePage.tsx
│   └── SessionPage.tsx
├── stores/          # Zustand stores
│   └── sessionStore.ts
├── types/           # TypeScript types
│   └── index.ts
├── App.tsx          # Root component
├── main.tsx         # Entry point
└── index.css        # Global styles
```

## Development

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run type-check
```

### Key Components

#### Chat Components

- `ChatArea` - Chat container with message list and input
- `ChatMessage` - Individual message bubble
- `ChatInput` - Message input with send button

#### Document Components

- `DocumentView` - Markdown document renderer with entity highlighting

#### Layout Components

- `Layout` - Main layout wrapper
- `Sidebar` - Navigation sidebar with category tree

## API Proxy

The Vite dev server proxies API requests to the backend:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```

## Environment Variables

Create `.env` file for environment-specific settings:

```
VITE_API_URL=http://localhost:8000
```

## License

MIT
