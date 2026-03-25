# Session Summaries

## 2026-02-12T~UTC - Continuation: Bug fixes, code review, git init
Continued from compacted session. Applied remaining code review fixes: release rate boundary clamp (max 99), minimap ImageData pre-allocation (reuse instead of creating each frame). Previously applied 11 critical/major fixes from comprehensive code review (48 issues found). Initialized git repo, created GitHub remote (discordwell/lemmings), committed and pushed.

## 2026-02-12T~UTC - Initial build and performance fixes
Built complete Lemmings browser game as single HTML file (~1100 lines). V1 had severe perf issues (~4fps from per-pixel fillRect). V2 rewrote terrain gen and minimap to use ImageData arrays. Fixed Chrome background tab throttling (rAF suppressed). Fixed level design issues: added steel containment walls, redesigned layer thicknesses for MAX_FALL=62 compliance, fixed exit positions, fixed IN counter formula.

# Key Findings

- **Chrome rAF throttling**: requestAnimationFrame callbacks are completely suppressed for background tabs (Chrome extension sidepanel steals focus). setTimeout is also throttled to ~5fps. Game works fine when user opens tab directly.
- **MAX_FALL=62**: All level designs must ensure max continuous fall (through dug shafts + gaps) stays under 62px or lemmings splat.
- **Level design pattern**: Use 30px earth layers with 25px gaps for diggable terrain. Steel containment walls on sides prevent walk-off deaths. Steel floors catch lemmings after final fall.
- **ImageData perf**: Use ImageData pixel arrays for bulk terrain generation and minimap rendering. Pre-allocate and reuse ImageData objects.
- **Git remote**: github.com/discordwell/lemmings (public repo)
