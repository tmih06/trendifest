# Obsidian visual reference

Sources: Obsidian's official site mock of its desktop app, the official Graph view
help screenshot, the public default-theme CSS values, and the developer docs
for graph CSS variables.

## Shell

Obsidian's official app mock is the closest source for a web recreation:

- App window: `#1e1e1e`, 1px `#363636` border, text `#dadada`.
- Title bar: 38px tall, `#262626`.
- Sidebar: `#262626`, 13px, `#b3b3b3`, 1px `#363636` divider.
- Sidebar rows: 3px 8px padding, 4px radius; hover and active
  `rgba(255,255,255,0.067)`; active text `#dadada`.
- Tabs: 38px bar, 13px; inactive `#666`; active `#1e1e1e` with 6px top corners.
- Pane toolbar icons: 24x21px, 4px radius, 60% opacity; active surface
  `rgba(255,255,255,0.067)`.
- Status bar: 11px, `#666`, `#1e1e1e`, 1px `#363636` top edge,
  4px 12px padding, right-aligned.
- Editor/body text: 14px, `#b3b3b3`, 1.4 line-height; headings `#dadada`
  (h1 28px/700, h2 20px/600).
- Accent tag: `#a78bfa`, background `hsla(258, 88%, 66%, 0.15)`.

Source: <https://obsidian.md/> (app-window/app-titlebar/app-sidebar/app-tab/
app-statusbar/app-editor rules in the served Tailwind CSS).

The real app also has a ribbon inside the left sidebar and two sidebars:
<https://help.obsidian.md/ribbon> and <https://help.obsidian.md/sidebar>.

## Default dark tokens

From the public default-theme variable set:

| Token                      | Dark value  |
| -------------------------- | ----------- |
| background-primary         | `#202020`   |
| background-primary-alt     | `#1a1a1a`   |
| background-secondary       | `#161616`   |
| background-modifier-border | `#333333`   |
| text-normal                | `#dcddde`   |
| text-muted                 | `#999999`   |
| text-faint                 | `#666666`   |
| text-accent                | `#7f6df2`   |
| text-accent-hover          | `#8875ff`   |
| interactive-normal         | `#2a2a2a`   |
| interactive-hover          | `#303030`   |
| interactive-accent         | `#483699`   |
| selection                  | `#17304dfc` |

Source: <https://github.com/mgmeyers/obsidian-style-settings/blob/main/obsidian-default-theme.css>

The official marketing shell uses slightly newer values (`#1e1e1e` window,
`#262626` chrome, `#363636` border, `#a78bfa` accent) and matches the current
app's density more closely. Use those for the app shell; keep the default-theme
tokens as fallbacks.

Font: Obsidian's default stack starts with Inter:
<https://github.com/mgmeyers/obsidian-style-settings/blob/main/obsidian-default-theme.css>

## Graph view

Official help describes the graph as note circles and link lines; hover
highlights a note's connections, click opens the note, wheel/keys zoom, drag
pans. Settings live behind a cog in the upper-right; there is no floating
legend or summary card in the graph surface.
<https://help.obsidian.md/plugins/graph>

Graph-specific CSS tokens:
`--graph-controls-width`, `--graph-text`, `--graph-line`, `--graph-node`,
`--graph-node-focused`, `--graph-node-tag`, `--graph-node-attachment`,
`--graph-node-unresolved`.
<https://docs.obsidian.md/Reference/CSS+variables/Plugins/Graph>

The official screenshot is light mode. It shows a plain background, very faint
lavender links, small hollow note circles with thin accent outlines, one filled
accent hub, and quiet gray labels with a background halo. There are no cards,
dot-grid scrims, or animated rings.
<https://publish-01.obsidian.md/access/f786db9fac45774fa4f0d8112e232d67/Attachments/obsidian-graph-view.png>

The official site's dark graph illustration uses 1px `rgba(255,255,255,0.2)`
links, white filled hubs, `#aaa` leaf circles and tiny accent-green nodes.
<https://obsidian.md/>

## Adaptation rules for Trendifest

- Main canvas: `#1e1e1e`; sidebars/title bar `#262626`; border `#363636`.
- Accent: `#a78bfa`; hover `#8b7cf6`; accent surface at 15% for tags.
- Use Inter, 13px UI / 14px reading, normal letter spacing.
- Use 4px controls, 6px tabs/modals; no large rounded cards or heavy shadows.
- Graph: filled purple pattern hubs; hollow muted/accent leaf circles; 1px
  lavender links; labels 11–12px with a background halo; no dot grid.
- Graph controls: bare icon buttons at the square's upper-right, not a floating
  pill.
- Selection: filled/glowing node, stronger links, dim the rest. Camera stays
  still.
- Sidebars are dense surfaces with rows, not cards. Status bar is quiet,
  11px, at the bottom.
