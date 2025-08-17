// ESLint configuration for modern ESLint 9.x
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        markdownit: "readonly",
        console: "readonly",
        performance: "readonly",
        Map: "readonly",
        Set: "readonly",
        Promise: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-undef": "warn",
      "prefer-const": "error",
      "no-var": "error"
    }
  }
];
