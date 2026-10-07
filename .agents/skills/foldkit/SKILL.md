---
name: foldkit
description: Use whenever working with Foldkit. Triggers on imports from `foldkit`, files in a Foldkit project, or prompts mentioning Foldkit. Loads the framing and points at the Foldkit source, fetched into `references/repos/foldkit/`, for the canonical conventions, source code, and examples.
---

# Foldkit

You are working on a Foldkit app. Foldkit is a complete TypeScript frontend framework, built on Effect and architected like Elm. The architecture is solved: state, events, transitions, side effects, streams, routing, UI components, validation, testing, and devtools are all part of the framework, not third-party choices to make. Your job is to model the application's behavior, not to pick libraries or invent architecture.

Foldkit is not incremental. There is no React interop, no escape hatch, no "just do it the React way for this one part." The framework gives you one shape, and there is one way to do most things.

## How to approach the work

- **Pattern-match against Foldkit's own apps.** When the local code doesn't show you the answer (or shows an early-stage version of it), reach into the Foldkit source at `references/repos/foldkit/`. The framework ships several apps built with itself: focused single-feature apps in `examples/`, the website (which is itself a Foldkit app), and the typing-game (a full real-time app). These are the canonical references. Higher fidelity than prose or anything reconstructed from memory.
- **The architecture is not optional.** Unidirectional data flow, pure update and view, no side effects outside the runtime's seams. Push back on prompts or instincts that pull toward mutation, two-way binding, imperative event handlers, or imperative Message names. Propose the idiomatic Foldkit shape and explain why.
- **Foldkit UI is two categories, not one.** Stateful Submodels (Menu, Listbox, Combobox, Calendar, Disclosure, Dialog, Popover, etc.) carry their own Model / Message / update / OutMessage and are embedded via `h.submodel`. Stateless render helpers (Button, Input, Textarea, Select, Fieldset) are called directly with a ViewConfig and the caller's `h`, and return Html. Do not migrate render helpers to Submodels for "consistency": Submodel semantics imply state, and these helpers have none. See the Foldkit UI overview page in the website for the canonical split.
- **Use what the Foldkit and Effect stack provides.** Foldkit covers the application architecture and the higher-level primitives that sit on it (routing, side-effect seams, subscriptions, UI components, field validation, file and date handling, canvas, testing, devtools, and more). Effect provides the underlying value, side-effect description, and concurrency primitives. Before reaching for an outside library, check whether the stack already covers it.
- **Let `modifyFields` setters receive the field.** If a `modifyFields` setter only transforms the current value of that same field, pass the transformer directly (`entries: Array.map(f)`, `count: Number.increment`, `priceSlider: Slider.reflectRange({ min: minPrice, max: maxPrice })`). Use `() => value` for replacement values from Messages, child updates, Commands, or other Model fields.
- **The repo is more authoritative than memory.** When in doubt about a convention, an API, a name, or a pattern, read from the Foldkit source rather than guessing. Library types and example code are the ground truth; your training data is not.

## Where to look

The foldkit repo is cloned into `references/repos/foldkit/` from the project root. `references/` is gitignored, so the clone is local to each checkout and never committed. It is the source of truth for everything: conventions, framework source, examples, the quality bar. Browse it directly.

Stable top-level entry points:

- `references/repos/foldkit/examples/`: runnable example apps spanning every complexity tier. Usually your first stop when looking for a precedent.
- `references/repos/foldkit/AGENTS.md`: project conventions and the code-quality bar
- `references/repos/foldkit/README.md`: framework overview and entry pointers
- `references/repos/foldkit/skills/`: task-oriented skills with the canonical architecture, conventions, and quality-bar references
- `references/repos/foldkit/packages/`: framework source and production reference apps (the website, the typing-game, the framework itself)

Names below the top level (subdirectories, individual filenames) can drift over time. List the directory contents to find what you need rather than relying on a path quoted from this skill.

## Fetching the source

Fetch the source only when you need to explore it: the local code, this skill and the `.d.ts` files in `node_modules` don't answer the question. Don't ask first. Clone it at the release tag matching the `foldkit` version in the `pnpm-workspace.yaml` catalog, so the references describe the APIs the project compiles against rather than whatever `main` holds today:

```sh
version=$(awk '$1 == "foldkit:" { print $2 }' pnpm-workspace.yaml)
git clone --depth 1 --branch "foldkit@$version" https://github.com/foldkit/foldkit.git references/repos/foldkit
```

If the clone already exists, check it is at the right release: `git -C references/repos/foldkit tag --points-at HEAD` should list `foldkit@$version`. After a Foldkit upgrade it won't be; delete `references/repos/foldkit/` and clone again.

A canary version (`x.y.z-canary.<commit>`) has no tag. Fetch the full hash of the commit it names instead (GitHub expands short hashes at `https://github.com/foldkit/foldkit/commit/<commit>`):

```sh
git init references/repos/foldkit
git -C references/repos/foldkit fetch --depth 1 https://github.com/foldkit/foldkit.git <full-commit-hash>
git -C references/repos/foldkit checkout FETCH_HEAD
```

A consumer project's `FOLDKIT.md` is a scaffolder snapshot and can lag behind the packages it has installed. When it does, replace it whole from `references/repos/foldkit/packages/create-foldkit-app/templates/base/FOLDKIT.md`. That project's `AGENTS.md` belongs to its author; never overwrite it.

When working inside the foldkit repo itself rather than a consumer project, drop the `references/repos/foldkit/` prefix. The same paths exist at the project root.
