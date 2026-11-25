# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Civil Engineering Thesis Panelists & Evaluators:** Inspect traffic microsimulation validity during live academic defense sessions on 1024px–1440px laptops and conference projectors. Need immediate proof of realistic physics, zero simulation faults, clear before/after scenario deltas, and verifiable Chapter 4 data exports.
- **Municipal Transportation Planners (Kabankalan City):** Test geometric and operational interventions along the Ceres Bus Terminal corridor before capital outlay—specifically evaluating dedicated PUV staging bays and coordinated intersection signalization.
- **Traffic Engineering Researchers:** Adjust multimodal demand volumes (Ceres buses, PUJ jeepneys, tricycles, private cars, pedestrians), inspect individual vehicle car-following/lane-changing state (IDM/MOBIL), and export reproducible CSV datasets for surrogate safety and LOS analysis.

## Product Purpose

**Kabankalan Traffic DSS v2 — Ceres Bus Terminal 3D Microsimulation Simulator** is an interactive 3D traffic decision-support system for evaluating congestion, weaving turbulence, and pedestrian-vehicle conflicts along the Ceres Bus Terminal corridor in Kabankalan City, Negros Occidental (Gates 1 & 2, Guanzon St. / National Highway frontage, and the Pedro Zayco intersection).

- **Surface Mode:** `Operate` — an engineering control and telemetry instrument overlaid on a full-bleed, Cities: Skylines-style 3D microsimulation viewport.
- **Success:** A panelist or planner can switch between **Baseline**, **Dedicated Bays**, and **Signalized** scenarios in one click, observe physically credible 3D multimodal traffic behavior without visual clipping or viewport obstruction, verify `0 FAULTS` operational integrity, inspect live HCM Level of Service (LOS A–F) and SSAM surrogate safety deltas, and print or export Thesis Chapter 4 reports directly.

## Positioning

Unlike abstract 2D queue calculators or non-interactive pre-rendered VISSIM clips, Kabankalan DSS v2 runs a deterministic, browser-native IDM + MOBIL multimodal microsimulation calibrated to Philippine mixed-traffic realities (Ceres provincial buses, jeepneys, tricycles, private vehicles, and curb-crossing pedestrians) inside a real-time 3D spatial twin with live inspector transparency and single-click thesis reporting.

## Operating Context

- **Primary usage scene:** Live thesis defense presentations (projector at 1024×768 or 1280×720, presenter laptop at 1280×800 or 1440×900) and desktop engineering analysis workstations.
- **Primary viewport priority:** The 3D corridor simulation fills 100% of the browser window at all times; HUD panels float at the perimeter and collapse cleanly so operators can inspect Gates 1 & 2, Pedro Zayco, or Top-Down CAD geometry unobstructed.
- **Core workflows:**
  1. **Scenario Evaluation:** Toggle `Baseline | Dedicated Bays | Signalized`, control playback (`Play/Pause`, `0.5x / 1x / 2x / 4x`), and monitor live corridor KPIs.
  2. **Demand Sensitivity Testing:** Tune bus headways, jeepney, tricycle, private car, and pedestrian volumes alongside Ground Mode (`3D Game / Satellite / Dark CAD`) and debug overlays.
  3. **Vehicle-Level Verification:** Click any simulated agent to inspect ID, class, lane, velocity, leader gap, MOBIL lane-change status, yielding cause, and engage Follow Cam.
  4. **Defense & Chapter 4 Reporting:** Engage Defense Mode for clean panel presentation, compare scenarios side-by-side in the Compare tab, and export CSV/print-ready Thesis Chapter 4 summaries.

## Capabilities and Constraints

- **Deterministic Microsimulation Core:** Intelligent Driver Model (IDM) longitudinal physics, MOBIL discretionary/mandatory lane changing, terminal gate queuing, pedestrian crosswalk yielding, and SSAM surrogate conflict detection (Rear-End, Crossing, Weaving via TTC/PET thresholds).
- **Zero-Fault Runtime Guarantee:** Continuous physics and geometry invariant checking surfaced directly in the top HUD (`0 FAULTS` emerald badge when clean; explicit diagnostic alert on any violation).
- **Strict Viewport Fit (Fixing v1 Regressions):**
  - Top header must remain a single compact row (`48px` height, `flex-nowrap`) with zero text wrapping, pill stacking, or title clipping across `1024px`, `1280px`, and `1440px` viewports.
  - Bottom Camera Dock must remain unobstructed and fit horizontally with zero clipping at `1024px`.
  - Side panels (`272px` Left Control Rail, `320px` Right Telemetry Drawer) must be independently collapsible to preserve maximum 3D scene visibility.
- **Telemetry Stability:** All ticking simulation clocks, speeds, control delays, queue lengths, and conflict counters must use fixed-width tabular numerals (`tabular-nums`) so live numbers never jitter horizontally.
- **Data Integrity:** Metrics displayed in Compare and Report views must reflect simulated corridor telemetry or clearly labeled calibrated baseline parameters—never fabricated marketing claims.

## Brand Commitments

- **Product Title:** Kabankalan DSS · Ceres Corridor (`Kabankalan City 3D Traffic Microsimulation DSS — Ceres Terminal Corridor`).
- **Voice & Register:** Direct civil-engineering and transportation-operations precision. Controls name their physical action (`Dedicated Bays`, `Top-Down CAD`, `Follow Cam`, `Export CSV`); metrics use standard HCM and FHWA SSAM terminology (`LOS`, `Avg Delay (s/veh)`, `Throughput (veh/hr)`, `TTC`, `SSAM Conflicts`).
- **Visual Direction (Pinned by Brief):** High-Contrast Dark Game/Engineering HUD (Obsidian/Graphite translucent panels over daylight 3D terrain) inspired by precision civil CAD tools and city-builder simulation HUDs. Authentic engineering craft—no generic SaaS purple gradients or decorative fluff.

## Evidence on Hand

- Project scaffold at `/Users/japhethgonzales/thesis 2/kabankalan-dss-v2` (Next.js 16.3.5, React 19, TypeScript 5, Tailwind CSS v4, Three.js 0.186, React Three Fiber 9, Drei 10, Zustand 5, Recharts 3, Lucide React).
- Simulation engine (`src/sim/`), 3D corridor scene (`src/scene/`), and HUD components (`src/components/`) are scheduled in subsequent build waves; no pre-recorded simulation runs exist yet in v2.

## Product Principles

1. **The 3D Corridor Leads:** Every pixel of chrome must earn its keep. Floating panels stay compact, high-contrast over sunlit terrain, and one click from collapsed.
2. **Auditability Over Spectacle:** Every metric, LOS grade, SSAM conflict, and vehicle decision is traceable to live simulation state—built to survive sharp thesis panel questioning.
3. **Zero Layout Breakage at Defense Resolutions:** 1024px, 1280px, and 1440px are first-class engineering targets; single-line headers, predictable collapse states, and non-jittering numerals are mandatory.
4. **Standard Transportation Vocabulary:** Use authentic HCM LOS A–F thresholds, FHWA SSAM conflict classes, and Kabankalan landmark names (`Gates 1 & 2`, `Pedro Zayco`, `Ceres Corridor`) consistently across 3D overlays, telemetry, and printed Chapter 4 tables.

## Accessibility & Inclusion

- Target WCAG AA contrast (`≥4.5:1` for UI body/labels, `≥3:1` for large badges and graphical indicators) even when translucent HUD panels float over bright sunlit 3D terrain or pale satellite imagery.
- Full keyboard operability and visible high-contrast focus rings (`:focus-visible`) across scenario pills, playback buttons, demand sliders, drawer tabs, and camera presets.
- Color-coded LOS grades (`A`–`F`) and SSAM conflict types are always paired with explicit letter badges or text labels—never communicated by hue alone.
- Respect `prefers-reduced-motion` for all UI panel and micro-interaction transitions.
