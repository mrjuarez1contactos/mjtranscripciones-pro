/// <reference types="vite/client" />

// Fix: Add explicit type definitions for import.meta.env to fix TypeScript errors in src/App.tsx
interface ImportMetaEnv {
    readonly VITE_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
