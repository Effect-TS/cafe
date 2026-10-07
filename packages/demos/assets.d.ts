// termcut publishes TypeScript source that imports its bundled renderer
// assets and generated JavaScript. Bun loads them; TypeScript needs to be
// told these modules exist.
declare module "*.css";
declare module "*.wasm";
declare module "*.ttf";
declare module "*/generated/page.js";
declare module "*/generated/player.js";
declare module "*/generated/presenter.js";
