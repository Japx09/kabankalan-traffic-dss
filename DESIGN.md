---
name: Kabankalan Traffic DSS v2
description: High-contrast obsidian engineering HUD over a full-bleed daylight 3D traffic microsimulation viewport.
colors:
  surface-canvas: "#090d12"
  surface-hud: "rgba(11, 16, 23, 0.86)"
  surface-hud-strong: "rgba(11, 16, 23, 0.94)"
  surface-panel: "#111822"
  surface-control: "#182230"
  surface-control-hover: "#202d3f"
  border-subtle: "rgba(148, 163, 184, 0.16)"
  border-strong: "rgba(148, 163, 184, 0.28)"
  ink-primary: "#f1f5f9"
  ink-secondary: "#94a3b8"
  ink-muted: "#64748b"
  accent-primary: "#38bdf8"
  accent-primary-hover: "#7dd3fc"
  accent-primary-muted: "rgba(56, 189, 248, 0.16)"
  status-ok: "#10b981"
  status-warn: "#f59e0b"
  status-danger: "#f43f5e"
  los-a: "#10b981"
  los-b: "#22c55e"
  los-c: "#84cc16"
  los-d: "#f59e0b"
  los-e: "#f97316"
  los-f: "#f43f5e"
  ssam-rear-end: "#f59e0b"
  ssam-crossing: "#f43f5e"
  ssam-weaving: "#38bdf8"
  print-surface: "#ffffff"
  print-ink: "#0f172a"
  print-border: "#cbd5e1"
  print-header: "#f1f5f9"
  specular-hairline: "rgba(255, 255, 255, 0.06)"
  shadow-ambient: "rgba(0, 0, 0, 0.65)"
typography:
  hud-title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  section-heading:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.02em"
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.005em"
  metric-lg:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  metric-sm:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0em"
  micro:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  header-bar:
    backgroundColor: "{colors.surface-hud-strong}"
    textColor: "{colors.ink-primary}"
    height: "48px"
    padding: "0 12px"
  hud-panel:
    backgroundColor: "{colors.surface-hud}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "12px"
  segment-active:
    backgroundColor: "{colors.accent-primary-muted}"
    textColor: "{colors.accent-primary-hover}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-primary:
    backgroundColor: "{colors.accent-primary}"
    textColor: "{colors.surface-canvas}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  camera-dock:
    backgroundColor: "{colors.surface-hud-strong}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.pill}"
    padding: "4px 6px"
---

# Design System — Kabankalan Traffic DSS v2

## Overview

Kabankalan Traffic DSS v2 is an **Operate-mode** engineering simulation workstation. The full-bleed 3D Cities: Skylines-style viewport renders Kabankalan City's Ceres Bus Terminal corridor in crisp daylight, satellite, or Dark CAD modes; the UI floats over it as a restrained, high-contrast **Obsidian/Graphite Game-Engineering HUD**.

**Physical Use Scene:** Civil engineering panelists and planners operating on `1024px`–`1440px` screens in lit conference rooms and daylight lecture halls. Dark obsidian translucent panels (`86%–94%` opacity with `14px` backdrop blur) guarantee `≥4.5:1` label legibility over sunlit asphalt, tropical foliage, and pale rooftops without competing with the 3D scene's chromatic traffic signals and vehicle liveries.

**Color Strategy:** Restrained neutral dark architecture (`90%+` obsidian/slate neutrals) + one disciplined functional sky-cyan active accent (`#38bdf8`) + strictly semantic HCM LOS (`A`–`F`) and FHWA SSAM conflict colors. Zero decorative gradients.

## Colors

### Surfaces & Chrome
| Token | CSS Variable | Value | Role |
|---|---|---|---|
| Canvas Backdrop | `--surface-canvas` | `#090d12` | Root viewport background before WebGL mount & Dark CAD base |
| HUD Translucent | `--surface-hud` | `rgba(11, 16, 23, 0.86)` | Left Control Rail, Right Telemetry Drawer, Inspector Pill |
| HUD Dense | `--surface-hud-strong` | `rgba(11, 16, 23, 0.94)` | Top Header (`48px`), Bottom Camera Dock, tooltips |
| Solid Panel | `--surface-panel` | `#111822` | Nested data wells, chart backgrounds, comparison table surfaces |
| Interactive Control | `--surface-control` | `#182230` | Inactive buttons, segmented track wells, input tracks |
| Control Hover | `--surface-control-hover` | `#202d3f` | Hover state for buttons, tabs, and list rows |
| Border Subtle | `--border-subtle` | `rgba(148, 163, 184, 0.16)` | Primary 1px structural hairlines & dividers |
| Border Strong | `--border-strong` | `rgba(148, 163, 184, 0.28)` | Elevated controls, focused tracks, table headers |

### Typography Ink
| Token | CSS Variable | Value | Contrast on HUD |
|---|---|---|---|
| Primary Ink | `--ink-primary` | `#f1f5f9` | `> 14:1` — headings, active values, primary labels |
| Secondary Ink | `--ink-secondary` | `#94a3b8` | `> 6.2:1` — parameter descriptions, units, inactive tabs |
| Muted Ink | `--ink-muted` | `#64748b` | `~3.8:1` — non-essential hints, chart axis ticks, dividers |

### Functional Accent & Runtime Health
| Token | CSS Variable | Value | Usage |
|---|---|---|---|
| Primary Accent | `--accent-primary` | `#38bdf8` | Active scenario, selected camera, slider fill, focus ring |
| Accent Hover | `--accent-primary-hover` | `#7dd3fc` | Active label ink on translucent sky pill |
| Accent Wash | `--accent-primary-muted` | `rgba(56, 189, 248, 0.16)` | Active segmented pill & selected vehicle highlight |
| Nominal / Healthy | `--status-ok` | `#10b981` | `0 FAULTS` indicator, positive scenario delta improvement |
| Caution | `--status-warn` | `#f59e0b` | Moderate congestion warning, medium TTC threshold |
| Critical / Fault | `--status-danger` | `#f43f5e` | Runtime fault alert, severe delay degradation |

### Semantic HCM Level of Service (LOS A–F) & SSAM Tokens
Colors are always paired with letter grades (`A`–`F`) or explicit conflict labels.

| Grade / Metric | CSS Variable | Value | Engineering Interpretation |
|---|---|---|---|
| LOS A | `--los-a` | `#10b981` | Free flow (`≤ 10 s/veh`) |
| LOS B | `--los-b` | `#22c55e` | Reasonably free flow (`> 10–20 s/veh`) |
| LOS C | `--los-c` | `#84cc16` | Stable flow (`> 20–35 s/veh`) |
| LOS D | `--los-d` | `#f59e0b` | Approaching unstable (`> 35–55 s/veh`) |
| LOS E | `--los-e` | `#f97316` | Unstable / at capacity (`> 55–80 s/veh`) |
| LOS F | `--los-f` | `#f43f5e` | Forced / breakdown (`> 80 s/veh`) |
| SSAM Rear-End | `--ssam-rear-end` | `#f59e0b` | Longitudinal TTC conflict |
| SSAM Crossing | `--ssam-crossing` | `#f43f5e` | Terminal gate / crosswalk / Pedro Zayco crossing conflict |
| SSAM Weaving | `--ssam-weaving` | `#38bdf8` | MOBIL lane-change / curb-bay merge turbulence |

## Typography

Loaded via `next/font/google` in `src/app/layout.tsx` and bound in Tailwind v4 `@theme inline`.

- **UI Sans — `Space Grotesk` (`--font-sans`):** Clean geometric proportions with unmistakable technical clarity at compact `11px–14px` HUD scales. Used for header branding, scenario controls, parameter labels, tabs, and report headings.
- **Data Mono — `JetBrains Mono` (`--font-mono`):** Reserved strictly for live measurements and engineering identifiers—simulation clock (`07:14:32`), speed (`28.4 km/h`), delay (`19.2 s`), queue length (`42 m`), vehicle IDs (`BUS-04`), coordinates, and CSV/Chapter 4 tables. Never used decoratively on UI prose.
- **Fixed `rem` Scale (No fluid `clamp()` headings):**
  - `1.375rem` (`22px`, `600`): Primary KPI figure & LOS grade badge (`JetBrains Mono`)
  - `0.875rem` (`14px`, `600`): Header brand title, inspector header
  - `0.8125rem` (`13px`, `400/500`): Standard controls, table cells, report body
  - `0.75rem` (`12px`, `500/600`): Compact segmented pills, slider labels, drawer tabs
  - `0.6875rem` (`11px`, `500`): Units, chart axes, secondary status chips (floor size; never smaller than `11px`)
- **Tabular Numerals Mandatory:** Every ticking clock, speed readout, counter, delta percentage, and slider value uses `tabular-nums` (`font-variant-numeric: tabular-nums lining-nums`) to prevent horizontal jitter during live 60fps simulation steps.

## Layout

All spacing follows a strict **8pt spatial grid** (`4px` micro-gaps, `8px` tight control groups, `12px` panel padding, `16px` structural separation, `24px` report sections).

### Spatial Architecture (Full-Bleed Viewport First)
1. **3D Viewport Layer (`z-0`):** Fixed `inset-0 w-screen h-screen` WebGL canvas, uninterrupted edge-to-edge.
2. **Top Engineering Header (`z-30`, `h-12` / `48px`):**
   - Strictly single-row (`flex flex-nowrap items-center justify-between gap-2 px-3`).
   - **Zero wrapping or clipping at `1024px`, `1280px`, and `1440px`:** Every group uses `shrink-0` and concise labels; secondary subtitle (`Ceres Corridor`) compresses cleanly via responsive utility classes (`hidden xl:inline`) if horizontal slack tightens at `1024px` while keeping Brand + Scenario Pill + Clock/Playback/Speed + `0 FAULTS` + Defense Mode visible and unclipped on one row.
   - Order left-to-right:
     1. Brand mark + `Kabankalan DSS` (+ `Ceres Corridor` divider on `xl+`)
     2. Scenario segmented control: `Baseline` | `Dedicated Bays` | `Signalized`
     3. Simulation transport cluster: Live Monospace Clock + Play/Pause toggle + Speed selector (`0.5x`, `1x`, `2x`, `4x`)
     4. Status & Presentation cluster: Faults indicator (`0 FAULTS` emerald pill) + `Defense Mode` toggle
3. **Left Control Rail (`z-20`, floating top `60px`, left `12px`):**
   - Width: `272px` expanded (`w-[272px]`), collapsible to a compact `40px` icon button at the top-left corner below the header.
   - Max height: `calc(100vh - 132px)` with internal `.dss-scroll` vertical scrolling so it never collides with the bottom Camera Dock.
   - Sections separated by clean `1px` hairlines (no nested cards): Traffic Demand sliders (Bus headway, Jeepney, Tricycle, Private Car, Pedestrian volume), Ground Mode switcher (`3D Game` | `Satellite` | `Dark CAD`), and Debug Overlays.
4. **Right Telemetry Drawer (`z-20`, floating top `60px`, right `12px`):**
   - Width: `320px` expanded (`w-[320px]`), collapsible to a compact `40px` icon toggle.
   - Max height: `calc(100vh - 132px)` with internal `.dss-scroll`.
   - 3 crisp tabs: `Live` (LOS badge A–F, Avg Delay, Speed, Throughput, Queue Length, SSAM Rear-End/Crossing/Weaving counters + live Recharts time-series sparkline), `Compare` (Baseline vs Dedicated Bays vs Signalized side-by-side deltas), `Report` (Thesis Chapter 4 CSV export + Print Summary).
5. **Bottom Camera Dock & Vehicle Inspector (`z-20`, floating bottom `12px`, centered):**
   - Single compact horizontal pill bar sized to fit cleanly inside `1024px` even with both side panels open (`max-w-[calc(100vw-24px)]`): `Isometric` | `Gates 1&2` | `Pedro Zayco` | `Top-Down CAD`.
   - When a 3D vehicle is selected, a compact **Selected Vehicle Inspector** strip docks immediately above the Camera Dock (ID, class, lane, speed, leader gap, MOBIL status, yielding reason, `Follow Cam` toggle, close button).
6. **Defense Mode:** Collapses side rails by default (with quick-reveal toggles intact) to maximize unobstructed 3D viewport projection while keeping the top Scenario/Transport bar and bottom Camera Dock live.

## Elevation & Depth

- **HUD Glass (`--surface-hud` + `backdrop-filter: blur(14px) saturate(140%)`):** Functional contrast shield over moving 3D geometry—not ornamental blur. Paired with a `1px solid var(--border-subtle)` outer stroke and a subtle `inset 0 1px 0 rgba(255, 255, 255, 0.05)` top specular edge so floating panels read like machined instruments.
- **Layered Shadows (offset + soft blur, never zero-offset neon halos):**
  - Panels: `0 12px 32px -8px rgba(0, 0, 0, 0.58), 0 2px 6px rgba(0, 0, 0, 0.36)`
  - Bottom Dock: `0 10px 28px -6px rgba(0, 0, 0, 0.65), 0 1px 3px rgba(0, 0, 0, 0.4)`
- **Z-Index Discipline:** Canvas `0` → 3D HTML labels `10` → Floating Rails & Camera Dock `20` → Top Header `30` → Popovers/Toasts `40`.

## Shapes

- **Outer Floating Panels:** `12px` (`--radius-lg`)
- **Inner Data Wells / Metric Tiles / Charts:** `10px` (`--radius-md`)
- **Buttons / Segmented Pills / Inputs / Badges:** `6px` (`--radius-sm`)
- **Bottom Camera Dock / Live Status Dot Chips:** `9999px` (`--radius-pill`)
- **Iconography:** Lucide React (`1.75px` stroke, `14px`–`16px` crisp pixel-aligned sizes). Zero unicode emoji glyphs substituting for UI icons.

## Components

Every interactive control must implement complete **default, hover, focus-visible, active, and disabled** states.

- **Segmented Controls (Scenario, Speed, Ground Mode, Drawer Tabs):** Dark recessed track (`--surface-control`) with `1px` border; active item uses `--accent-primary-muted` fill, `1px solid rgba(56, 189, 248, 0.42)`, and `--accent-primary-hover` ink. Single-line `whitespace-nowrap`.
- **Precision Demand Sliders (`.dss-slider`):** `4px` recessed track with cyan active progress fill and a crisp `14px` circular obsidian/sky thumb (`2px` border) that scales slightly on hover/active and displays a clear `:focus-visible` ring. Value readout sits inline to the right in `JetBrains Mono tabular-nums`.
- **LOS Badge:** High-contrast square/pill badge pairing the semantic HCM color with bold monospace letter (`A`–`F`) and threshold sub-label (e.g., `LOS B · 16.4 s/veh`).
- **Faults Indicator:** Compact pill in top header. Nominal state shows a steady emerald dot + `0 FAULTS` (`--status-ok`); non-zero faults switch to rose (`--status-danger`) with exact fault count and diagnostic tooltip.
- **Browser Surfaces & Print:**
  - Text selection tinted sky (`rgba(56, 189, 248, 0.25)`), sky caret, `2px solid #38bdf8` `:focus-visible` ring with `2px` offset.
  - Ultra-thin `6px` slate scrollbars (`.dss-scroll`) that stay unobtrusive inside rails.
  - **Print Stylesheet (`@media print`):** Hides WebGL canvas and `[data-hud-chrome]` controls, switches root surface to pure white (`#ffffff`) and ink to slate-900 (`#0f172a`), unlocks document scroll, and prints Thesis Chapter 4 summary tables cleanly with preserved LOS badge colors.

## Motion

- **Fast, state-driven transitions (`150ms`–`200ms`, `cubic-bezier(0.16, 1, 0.3, 1)`):** Drawer collapse/expand, tab switching, hover states, and active pill highlights respond immediately without sluggish choreography.
- **Zero entrance choreography on page load:** Operators land directly in the live simulation.
- **Reduced Motion:** `@media (prefers-reduced-motion: reduce)` collapses UI transition durations to `0.01ms`.

## Do's and Don'ts

### Do
- Keep the top header strictly one horizontal line (`h-12`, `flex-nowrap`) tested at `1024px`, `1280px`, and `1440px`.
- Apply `font-mono tabular-nums` to every numeric readout, simulation clock, slider output, and table column.
- Separate control sections inside floating panels with quiet `1px` hairlines and generous vertical rhythm instead of wrapping every group in nested rounded cards.
- Pair every semantic color (LOS A–F, SSAM conflict type, fault status) with explicit text or letter grade.
- Mark HUD chrome containers with `data-hud-chrome` so Thesis Chapter 4 print output stays spotless.

### Don't
- Never use eyebrow/kicker micro-labels above section headings—let clean headings carry their own weight.
- Never use purple/indigo SaaS gradients, neon outer glows, or gradient text anywhere in the HUD.
- Never allow nested cards inside panels or identical uniform icon-heading-text marketing grids.
- Never substitute Unicode emojis for Lucide SVG icons.
- Never let a floating panel clip or cover the center Ceres Terminal Gates 1 & 2 corridor when collapsed or at standard `1280px` width.
