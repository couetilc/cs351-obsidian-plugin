# Cloud Assignment Obsidian Plugin

Self-contained Obsidian plugin that compiles MDX to HTML using `@mdx-js/mdx`,
Preact, and Shiki. Renders cloud assignment documents with live preview and
standalone HTML export.

## Install via BRAT

1. In Obsidian, go to Settings > Community Plugins > Browse, search for
   "BRAT", and install it. Enable it.
2. In Settings > BRAT > "Add Beta Plugin" > enter
   `couetilc/cs351-obsidian-plugin` > Add Plugin.
3. Settings > Community Plugins > enable "Cloud Assignment".

BRAT auto-updates the plugin when new releases are published.

## Development

```sh
npm install
npm test        # run tests (100% coverage enforced)
npm run build   # production build to dist/
npm run dev     # watch mode
```

## Release

Tag and push to trigger the GitHub Actions release workflow:

```sh
git tag v2.1.0
git push origin v2.1.0
```

The workflow runs tests, builds, and creates a GitHub Release with `main.js` and
`manifest.json` as assets. It also bumps the version in `manifest.json` and
`package.json` to match the tag.
