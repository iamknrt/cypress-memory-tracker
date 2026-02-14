# @mknrt/cypress-memory-tracker

Cypress plugin to track JavaScript memory usage during tests.

## Installation

```bash
npm install @mknrt/cypress-memory-tracker
```

## Setup

### 1. Plugin (cypress.config.js)

```js
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  expose: {
    memoryTracking: {
      enabled: true,
      trackSpecOnly: false, // true — only spec summaries, false — per-test details
      debug: false,
    },
  },
  e2e: {
    setupNodeEvents(on, config) {
      require('@mknrt/cypress-memory-tracker/dist/cypress-memory-tracker')(on, config);
      return config;
    },
  },
});
```

### 2. Support (cypress/support/e2e.js)

```js
import '@mknrt/cypress-memory-tracker/dist/memory-commands';
```

## Commands

- `cy.startMemoryTracking(options?)` — start tracking memory for the current test
- `cy.stopMemoryTracking()` — stop tracking and save results
- `cy.getMemoryUsage()` — get current JS heap size
- `cy.logMemoryUsage()` — log current memory to Cypress log

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Enable/disable memory tracking |
| `trackSpecOnly` | boolean | `false` | Only output per-spec summaries |
| `debug` | boolean | `false` | Enable debug logging |

## License

MIT