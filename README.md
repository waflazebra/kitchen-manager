# Kitchen Manager (prototype)

A school kitchen tool: menu from MealViewer, class sheet counts, extras, production plan, inventory and an order request for the kitchen director.

Plain HTML/CSS/JS with no build step. Data is saved in the browser (localStorage) on the computer that uses it. Settings → Download backup saves a copy. Settings → PIN lock adds a simple PIN screen. It prevents accidental changes, but it isn't strong security.

## Run it locally

```
cd kitchen-manager
python3 -m http.server 8787
```
Then open http://127.0.0.1:8787. Opening `index.html` directly from disk also works, but the browser may block the live menu; it then falls back to the saved copy in `menu-snapshot.js`.

## Live site (GitHub Pages)

https://waflazebra.github.io/kitchen-manager/

Every push to `main` updates the site within a minute or two. Kitchen data never goes to GitHub: it stays in the browser that uses the app. The repo only holds the code and example data.

## Files

- `index.html`: page shell
- `app.js`: all logic and screens
- `seed.js`: example data (classes, inventory, recipes, history), marked as examples in the app
- `menu-snapshot.js`: offline copy of the Nov 16–20, 2026 menu
- `styles.css`

## Phase 2 ideas

- **Shared data, logins and more schools:** move storage to Supabase (Postgres + auth, row-level security per school). The data is already split per school.
- **Read class sheets from a photo:** a small serverless function calls a vision model and returns counts per column for the manager to confirm.
- **Delivery invoices from a photo:** the same approach, for restocks.
