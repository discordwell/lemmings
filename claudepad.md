# Session Summaries

## 2026-06-11T~UTC - Maintenance: physics fix, nuke fix, timer UI, keyboard, persistence, test suite, docs
Fixed walker footing scan to be nearest-first (STEP_SCAN) — old top-down scan teleported lemmings up through bridges/overhangs within 6px overhead. Fixed nuke: flag now latches (previously auto-cleared once all current lemmings armed, reopening the entrance and leaving the level unfinishable); entrance closes during nuke and level ends when everyone is gone. Added visible TIME display (was invisible — levels ended by surprise), red under 30s. Added keyboard shortcuts (1-8/P/Space/F/N/M/Esc/-/=), right-click deselect, mute button, localStorage persistence of unlocked levels. Refactored button handlers into Game methods. Built zero-dep test suite (tests/run-tests.mjs): vm sandbox + DOM stubs, 16 tests incl. scripted solve of level 1 and synthetic keydown dispatch. Ran multi-agent code review; applied fixes: keydown ignores browser shortcuts (Cmd/Ctrl/Alt, but Ctrl+Alt=AltGr passes), toolbar buttons blur on click (Space won't re-trigger them), right-click deselect on minimap too, removed dead doWalk branch + unused countDead/maxTime, SAVE_KEY const, sfx.unlock() helper, s-time only rewritten when the displayed second changes. Wrote README.md + ARCHITECTURE.md.

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
- **Tests**: `node tests/run-tests.mjs` — extracts the script from index.html into a Node `vm` sandbox with DOM/canvas stubs and drives `game.update()` directly. Any physics/rules change needs a test there. Use blank terrain + `fill()` for determinism (level generators add random grass blades).
- **Walker footing scan**: must search nearest-current-height first (STEP_SCAN order). Scanning top-down (-6..+3) makes lemmings pop up through any solid ≤6px overhead (e.g. builder bridges).
- **Aligned holes chain falls**: digger holes at the same x in stacked layers create one continuous fall that can exceed MAX_FALL — stagger hole positions (level-1 solver test digs at 440/480/520).
