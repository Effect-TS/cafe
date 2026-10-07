import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.{test,spec}.ts'],
          environment: 'happy-dom',
          setupFiles: ['./src/vitest-setup.ts'],
          server: {
            deps: {
              inline: ['foldkit', '@foldkit/ui', '@foldkit/devtools'],
            },
          },
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
