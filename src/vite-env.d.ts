// Fix: Removed Vite-specific type references which were causing errors.
// Added a declaration for process.env.API_KEY to align with coding guidelines and provide types for TypeScript.
declare var process: {
  env: {
    readonly API_KEY: string;
  };
};
