# Grid Games

A touch-friendly collection of grid puzzle games. Every puzzle is randomly
generated at the size and difficulty you pick.

## Games

### Simple Number Connect

Touch **1** and drag one continuous path through the numbers in order
(1 → 2 → 3 …) so that it fills **every** open cell.

- Dark hatched cells are blocked; thick lines between cells are walls.
- Drag back over your line to erase it, tap any part of the line to cut it
  there, or use Undo / Clear.
- Every generated puzzle is checked by a solver to have exactly one solution.
- Difficulty: Easy puts numbers close together with few obstacles. Hard
  spaces the numbers far apart along the path but close together on the
  board, so the obvious direct route is usually wrong, and adds more walls
  and blocked cells.

## Adding a game

Each game lives in `src/games/<name>/` and exports a `GameDefinition`
(`src/games/types.ts`): title, rules, sizes, a `generate(size, difficulty)`
that returns a URL-safe puzzle code, and a `Play` component. Register it in
`src/games/registry.ts` and it shows up on the home menu with routing,
generation spinner, and per-mode best times handled by the shell.

## Development

```bash
npm install
npm run dev
```

`npm run bench` generates a batch of puzzles for every size/difficulty and
checks each one has a unique solution.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the
app and deploys it to GitHub Pages (served from `/gridgames/`).
