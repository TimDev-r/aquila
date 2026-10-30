<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Aquila rules
- File ownership: src/lib/market/, src/lib/trading/, src/data/replay/, scripts/ (Person 3); src/lib/voice/, src/content/lessons.json, README.md, LICENSE, docs/ (Person 4); prompts/ and all of supabase/functions/ (teammates). Never edit them; adapt UI instead. Why: teammates push these via git sync.
- src/lib/contracts.ts is frozen. Why: shared contract between four developers.
- All edge-function calls go through src/lib/api.ts, which falls back to src/mocks/*.json and never throws. Why: UI must work offline/without backend.
- AppShell (src/components/aquila) renders the root <Outlet />; /lesson/* renders full-screen without the shell.
- lightweight-charts is only loaded via dynamic import inside CandleChart's effect. Why: it touches the DOM and breaks SSR.
