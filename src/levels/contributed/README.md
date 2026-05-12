# Contributed levels

Drop `.json` files here that the in-app editor produces. They auto-ship in the
next build via Vite's `import.meta.glob` — no code changes required.

## Workflow

1. Open the in-app **Level Editor** from the main menu.
2. Paint pixels, place shooters, set ammo/rate, draw welds, set the time limit.
3. Hit **↓ Download** — the editor saves a `<slugified-name>.json` to your downloads.
4. Move that file into this folder.
5. `git add`, commit, push. GitHub Actions rebuilds and Pages auto-deploys.
6. The new level appears in the main menu under **Levels**.
