# UI Context

The UI is a demo harness only (the brief puts client display out of
scope). It exists to make real-time delivery and preference gating
visible. It is a single `public/index.html` with no build step.

## Theme

Dark only. A game-launcher feel: near-black background, layered
panels, and one vivid accent. Game and social notifications get
distinct accent colors so the category is visible at a glance.

## Colors

| Role             | CSS Variable       | Value     |
| ---------------- | ------------------ | --------- |
| Page background  | `--bg-base`        | `#0d0f14` |
| Surface          | `--bg-surface`     | `#161a22` |
| Raised surface   | `--bg-raised`      | `#1f2430` |
| Primary text     | `--text-primary`   | `#e8ebf2` |
| Muted text       | `--text-muted`     | `#8b93a7` |
| Primary accent   | `--accent-primary` | `#7c5cff` |
| Game category    | `--cat-game`       | `#f5b942` |
| Social category  | `--cat-social`     | `#3ccf91` |
| Border           | `--border-default` | `#2a3040` |
| Error            | `--state-error`    | `#ff5d6c` |
| Success          | `--state-success`  | `#3ccf91` |

## Typography

| Role      | Font                                 | Variable      |
| --------- | ------------------------------------ | ------------- |
| UI text   | system-ui stack                      | `--font-sans` |
| Code/mono | ui-monospace, SFMono-Regular, Menlo  | `--font-mono` |

## Border Radius

| Context           | Value  |
| ----------------- | ------ |
| Inline / small UI | `6px`  |
| Cards / panels    | `12px` |

## Component Library

None. Plain HTML and CSS with the tokens above.

## Layout Patterns

- Header: title + connection status.
- Control panel: buttons that fire each simulated event.
- Two player panes side by side (stacked under 800px). Each has a
  player selector, Game/Social toggles, and a live notification feed.
- New notifications slide in at the top of the feed.

## Icons

Unicode/emoji glyphs per notification type (no icon library).
