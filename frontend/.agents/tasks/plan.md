# Implementation Plan — OpsPilot Liquid Glass Restyle

Visual redesign only. React 18 + Vite + TypeScript, plain CSS. The single stylesheet
`frontend/src/styles.css` holds the whole design system. Two small, additive, logic-preserving
JSX edits are needed (a font link in `index.html`, and timeline markup in `IncidentPanel.tsx`).

## Ground rules for the coder (read before starting)

- CSS-first. Do NOT touch backend, Terraform, AWS, env vars, API endpoints, request/response
  shapes, simulation logic, severity logic, or polling/data-fetching logic.
- Do NOT alter event handlers, props, state, data fetching, or rendered dynamic values. JSX edits
  are allowed ONLY to add wrapper/structure (new `<div>`s, timeline stage markup) — never to change
  what dynamic value is rendered.
- Do NOT invent telemetry or timestamps. The ONLY timestamps in frontend data are
  `incident.createdAt` / `incident.updatedAt` (see `src/utils/incidents.ts`, `src/types/incident.ts`).
  There are NO per-stage pipeline timestamps. The incident timeline MUST therefore render its
  stages WITHOUT per-stage times (stages only). `createdAt` already appears as the "Started" metric;
  do not repurpose it into fake stage times.
- Keep every existing class name working. You are restyling existing selectors and ADDING new ones;
  do not rename classes the components depend on (that would require TS/JSX changes).

### Dynamic data that already exists — reuse, invent nothing

- Header (App.tsx, already static literals, keep as-is): `OPSPILOT`, `AI INCIDENT COMMAND CENTER`,
  `us-east-1`, `SYSTEM LIVE`, `SRE` avatar. These already match the brief — restyle only.
- Service fleet (ServiceGrid.tsx): 4 fixed services (Authentication API / Payment API / Orders API /
  Media Processor) with `.icon`, `.short`; live `status` ∈ {Operational, Degraded, Critical} derived
  from severity; telemetry `p95Latency`, `errorRate`, `cpuUsage`; `LAST SIGNAL` via `formatAgo`.
- Active incident (IncidentPanel.tsx): `incident.service`, `incidentId`, `severity` + `severityLabel`
  (Critical/High/Elevated/Low/Unscored), `status`; metrics Error rate / P95 latency / CPU / Started;
  error codes from `telemetry.errorCodes ?? telemetry.errors`; AI analysis four blocks
  (Probable cause, Evidence, Impact, Recommended actions) via `analysisText(...)`; empty state when
  no active incident.
- History (IncidentHistory.tsx): table rows with id slice, service cell, severity badge, status badge,
  `formatTime(createdAt)`, probable-cause cell; `highlight-row` on the just-created incident.

### Verification for every step

There is no test framework (`package.json` scripts: `dev`, `build` = `tsc -b && vite build`, `preview`).
Verification command for each code step is the production build:

```
cd frontend; npm run build
```

Expected outcome: `tsc -b` reports no type errors and `vite build` completes with an exit code of 0
(TS must still compile because JSX edits are additive/structural only). For visual confirmation run
`cd frontend; npm run dev` and load the app at 1440px — telemetry stays readable, no console errors,
all three simulations still trigger and render incidents. CSS-only steps cannot break the TS build;
the build check still guards the two JSX/HTML edits.

---

## Steps

- [ ] 1. Add the web-font links and keep system fallbacks, in `index.html`.
      Add two `<link>` tags in `<head>` for Inter (sans) and JetBrains Mono (mono) from Google Fonts
      (preconnect + stylesheet). This is purely additive markup; if offline the CSS font stacks below
      fall back to system fonts, so nothing breaks. Update `<meta name="theme-color">` to `#F4F6FA`.
      Files: `frontend/index.html`
      Verify: `cd frontend; npm run build` succeeds; in `npm run dev` headings render in Inter and
      telemetry values in a mono face (or system fallback if fonts are blocked).

- [ ] 2. Replace the `:root` token block at the top of `styles.css` with the Liquid Glass design tokens.
      Define CSS variables (keep the SAME variable NAMES already referenced elsewhere — `--bg`, `--panel`,
      `--panel2`, `--text`, `--muted`, `--dim`, `--accent`, `--green`, `--amber`, `--red`, `--line`,
      `--font-sans`, `--mono`, `--display` — so existing `var()` uses keep resolving) PLUS new glass/ambient
      tokens. Values:
        - `--bg: #F4F6FA;` `--text: #111318;` `--muted: #707580;` `--dim: #8A90A0;`
        - `--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;`
          `--display: var(--font-sans);`
          `--mono: "JetBrains Mono", "SF Mono", "IBM Plex Mono", ui-monospace, monospace;`
        - Glass: `--glass: rgba(255,255,255,0.48);` `--glass-strong: rgba(255,255,255,0.70);`
          `--glass-edge: rgba(255,255,255,0.70);` `--glass-inset: inset 0 1px 0 rgba(255,255,255,0.90);`
          `--glass-shadow: 0 24px 60px rgba(50,60,90,0.10);`
          `--glass-shadow-hover: 0 30px 70px rgba(50,60,90,0.16);`
          `--radius-lg: 26px;` `--radius-md: 18px;` `--radius-sm: 12px;` `--blur: 28px;`
        - Ambient: `--amb-blue: #63A4FF;` `--amb-lavender: #A78BFA;` `--amb-cyan: #67E8F9;`
          `--amb-pink: #F0ABFC;`
        - Semantic (reuse the status names components emit): `--green: #10B981;` (operational emerald)
          `--amber: #F59E0B;` (degraded) `--red: #F2555A;` (critical coral); `--accent: #4C8DFF;`
          `--ai-blue: #5B8DEF;` `--ai-violet: #A78BFA;` `--ai-cyan: #67E8F9;`
      Keep `font-family/color/background/font-synthesis/text-rendering` on `:root` as now but pointing at
      the new tokens.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; page background and text colors shift to the new
      palette with no missing-variable fallbacks.

- [ ] 3. Build the LEVEL-1 ambient background on `body` in `styles.css`.
      Set `body { background: var(--bg); }` and add a fixed, non-interactive aurora layer via
      `body::before` (`position: fixed; inset: 0; z-index: -1; pointer-events: none;`) using layered
      `radial-gradient`s that read like soft light sources behind glass, NOT solid blobs — low alpha
      (~0.18–0.28), large radii: electric blue upper-left, lavender upper-right, cyan lower-middle,
      faint violet lower area near the incident region. Add a very slow `@keyframes auroraDrift`
      (background-position or transform translate of a few px over 30–45s, `ease-in-out infinite
      alternate`) and gate it behind `@media (prefers-reduced-motion: no-preference)`. Keep contrast
      high enough that telemetry stays readable.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; in `npm run dev` the canvas shows four faint
      colored light fields that drift slowly; text remains crisp.

- [ ] 4. Add reusable glass utility rules (the glass "system") near the top of `styles.css` after tokens.
      Define a base glass pattern as a set of shared declarations you then apply to the real selectors
      (plain CSS has no mixins, so introduce helper classes `.glass`, `.glass-strong`, `.glass-inset`
      AND reuse their declarations inside the existing panel/card selectors in later steps). Base glass:
        ```
        background: var(--glass);
        backdrop-filter: blur(var(--blur)) saturate(160%);
        -webkit-backdrop-filter: blur(var(--blur)) saturate(160%);
        border: 1px solid var(--glass-edge);
        box-shadow: var(--glass-shadow), var(--glass-inset);
        border-radius: var(--radius-lg);
        position: relative;
        ```
      Add a shared top-left liquid highlight via a `::before` pattern (absolutely positioned, inherits
      radius, `background: linear-gradient(135deg, rgba(255,255,255,0.65), rgba(255,255,255,0) 45%);`
      `pointer-events: none;`) that you will attach to LEVEL-2 panels. Provide `@supports not
      (backdrop-filter: blur(1px))` fallbacks raising background alpha (e.g. `rgba(255,255,255,0.82)`)
      so non-supporting browsers still look solid.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; a temporary element with `class="glass"` (or the
      panels after later steps) shows translucent blur, soft shadow, rounded corners, and a faint
      top-left sheen.

- [ ] 5. Restyle the app shell + floating glass top header (LEVEL 2) in `styles.css`.
      `.app-shell`: keep `max-width:1440px; margin:auto;` but increase horizontal padding and add top
      padding so the header can float. `.topbar`: convert from a full-bleed sticky bar into a floating
      glass control pill — remove the full-width `border-bottom` and negative margins, give it the glass
      base (background/blur/border/shadow from step 4), `border-radius: var(--radius-lg)`, inset margin
      from the top (e.g. `margin: 18px 0 8px; position: sticky; top: 14px;`), comfortable padding. Restyle
      `.brand-mark` (glass/tinted chip with soft accent), `.brand strong` (Inter 600), `.region-chip`,
      `.top-divider`, `.live-indicator` (green dot pulse), `.avatar` as small translucent pills. Keep the
      green status dot; add a gentle `@keyframes dotPulse` (opacity/scale, reduced-motion gated) used by
      `.live-indicator i`, `.brand-mark i`.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; header visually floats above content as a single
      glass pill with brand left and region/live/avatar right; sticky on scroll.

- [ ] 6. Restyle the page heading and the system-health card in `styles.css`.
      `.page-heading`, `.eyebrow`, `.eyebrow-line`, `.heading-sub`, `h1` — refine type scale with Inter,
      `--text`/`--muted` tokens, tighter tracking on `h1`. Convert `.health-card` (and `.degraded` /
      `.critical` modifiers) into a LEVEL-3 inset glass chip using `.glass-strong` styling: subtle tint by
      state (green/amber/coral at low alpha, NOT thick borders), `.health-pulse` becomes a soft left glow
      bar tinted by state, `.health-icon` a tinted translucent circle. Keep the live `{health}` text and
      counts untouched.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; heading reads premium; health card is a translucent
      chip whose tint follows HEALTHY/DEGRADED/CRITICAL.

- [ ] 7. Restyle section headers and the service fleet cards (LEVEL 2 panels + LEVEL 3 inner) in `styles.css`.
      `.section-block`, `.section-title`, `.section-kicker`, `.section-meta`, `.health-legend`,
      `.fleet-count`: mono kickers in `--dim`, refined spacing. `.service-grid`: keep
      `repeat(4,1fr)`, slightly larger gap. `.service-card`: apply glass base (translucent, blur, soft
      shadow, `--radius-md`→`--radius-lg`), attach the top-left `::before` sheen; REMOVE the thick
      `border-top: 3px solid ...` status bars and instead express status with a subtle tint/glow:
      `.service-card.degraded`/`.service-card.critical` get a faint colored inner wash
      (`box-shadow: inset 0 0 0 1px <tint>` or a low-alpha background tint) plus keep the existing
      `.service-status` pill tinted (operational green dot, degraded amber, critical coral). Hover:
      `transform: translateY(-2px)`, brighter `--glass-edge`, `box-shadow: var(--glass-shadow-hover)` —
      no scaling. Restyle `.service-icon` (translucent tile), `.service-metrics` (mono values `.service-metrics b`
      and `small` using `--mono`), `.service-updated` (mono, muted). Keep the 3-column metrics layout.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; four translucent service modules with pill status,
      mono telemetry, gentle 2px hover lift and no thick colored borders.

- [ ] 8. Restyle the incident-simulation section into horizontal glass action capsules in `styles.css`.
      `.simulation-section`: LEVEL-2 glass panel (glass base, `--radius-lg`, generous padding), keep the
      `210px 1fr` grid. `.simulation-intro` type refinements. `.simulation-controls`: keep
      `repeat(3,1fr)`. `.scenario-button`: turn into a premium horizontal glass capsule — translucent
      `--glass` background (not solid grey, not a big colored button), thin `--glass-edge` border,
      `--radius-md`, left `.scenario-icon` as a small tinted translucent tile (keep `.red`/`.violet`
      tonal icon tints but muted), `.scenario-copy strong/small`, `.scenario-arrow` as a soft indicator.
      Hover (`:hover:not(:disabled)`): brighter edge, `translateY(-2px)`, a subtle underlying color shift
      (very low-alpha accent background), soft shadow bump. Keep `:disabled { opacity; cursor: wait }`.
      Restyle `.processing-banner`, `.error-banner`, `.spinner`, `.polling-label` to the glass/accent
      palette (`--accent`, coral for errors); keep the `spin` keyframes.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; three glass capsules with icon/title/subtitle/arrow,
      subtle hover; triggering each scenario still shows the processing banner and creates an incident.

- [ ] 9. Add the incident timeline markup inside the active-incident panel (additive JSX) in `IncidentPanel.tsx`.
      Insert a new block AFTER the `.metrics-grid` div and BEFORE the `error-codes` block (or between
      error-codes and analysis-header), rendering four fixed pipeline stages as an ordered strip:
      `SIGNAL → INGESTED → SEVERITY CALCULATED → ANALYSIS READY`. Render stages WITHOUT timestamps
      (no per-stage time data exists — do not use or fabricate any). Mark the last stage "ready" only
      when `analysis` is truthy (reuse the existing `analysis` const already computed at the top of the
      component; do not add new data access or state). Markup shape (new classes, no logic change):
        ```tsx
        <div className="incident-timeline" aria-label="Incident pipeline">
          <div className="timeline-stage done"><span className="tl-dot" /><span className="tl-label">Signal</span></div>
          <div className="timeline-stage done"><span className="tl-dot" /><span className="tl-label">Ingested</span></div>
          <div className="timeline-stage done"><span className="tl-dot" /><span className="tl-label">Severity calculated</span></div>
          <div className={`timeline-stage ${analysis ? 'done' : 'pending'}`}><span className="tl-dot" /><span className="tl-label">Analysis ready</span></div>
        </div>
        ```
      This is purely presentational and preserves all existing rendered values. Do NOT modify the empty
      state return.
      Files: `frontend/src/components/IncidentPanel.tsx`
      Verify: `cd frontend; npm run build` succeeds (TS compiles — edit is additive JSX using the
      existing `analysis` variable); in `npm run dev` the timeline strip appears inside an active
      incident with the final node lit once analysis exists, and with no timestamps.

- [ ] 10. Restyle the active-incident panel as the primary glass focus + integrated telemetry + timeline, in `styles.css`.
      `.incident-block`, `.refresh-state`. `.incident-panel`: the largest LEVEL-2 glass surface — glass
      base, `--radius-lg`, bigger padding, slightly stronger shadow than other panels, top-left `::before`
      sheen, plus a very faint ambient tint behind it (low-alpha violet) to echo the brief's "faint violet
      glow near the incident section". `.incident-heading h2` large Inter; `.incident-id` mono/dim;
      `.live-dot` soft amber pulse. Badges `.badge`, `.severity.*`, `.status.*` → translucent tinted pills
      (map Critical=coral, High/Elevated=amber, Low/Unscored=neutral, status active=emerald,
      investigating=amber, resolved=neutral). `.metrics-grid` + `.metric`: make it read as ONE integrated
      instrument panel, not four KPI cards — one translucent inset strip (`.glass-inset`/low-alpha fill,
      inner radius) with thin divider rules between metrics; `.metric strong` large well-spaced `--mono`
      values, `.metric span` mono kicker in `--dim`. `.error-codes code` → mono coral-tinted glass chips.
      Style the new `.incident-timeline` (step 9): a subtle horizontal strip with connector lines between
      `.tl-dot`s, `.timeline-stage.done .tl-dot` filled accent/emerald, `.pending` muted; `.tl-label`
      small mono/sans in `--muted`; low visual weight so it reinforces the pipeline without competing.
      Keep `.empty-panel` restyled as a calm glass surface.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; the active incident is the clear focal glass surface
      with large mono telemetry in one instrument strip, tinted badges, and a subtle pipeline timeline.

- [ ] 11. Restyle the AI incident analysis as the signature inset (LEVEL 3) glass layer, in `styles.css`.
      `.analysis-header`: convert the current left-border banner into an inset secondary glass layer
      sitting inside the incident panel — its own translucent surface with `--radius-md`, a subtle
      blue→lavender refraction glow behind it (e.g. a `::before` radial/linear gradient using
      `--ai-blue`/`--ai-violet`/`--ai-cyan` at low alpha, `filter: blur(...)`, `pointer-events:none`),
      cool accents, NOT a saturated purple card. Keep the `✦` `.analysis-icon` as a cool tinted glass
      chip; `.analysis-header > div span` secondary text "Automated signal correlation"; `.analysis-ready`
      a small emerald mono "ANALYSIS READY" pill with an optional gentle fade-in
      (`@keyframes analysisFade`, reduced-motion gated). `.analysis-grid` keeps `repeat(4,1fr)`;
      `.analysis-block` dividers become faint; `h3` clean Inter, `p/li` readable `--muted` at comfortable
      line-height — a diagnostic instrument, not a chatbot bubble.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; the AI section reads as a refined inset glass panel
      with a soft cool-blue glow and four readable columns (Probable cause / Evidence / Impact /
      Recommended actions).

- [ ] 12. Restyle the incident-history table and footer to match the glass system, in `styles.css`.
      `.history-section`, `.count-chip`. `.table-wrap`: LEVEL-2 glass surface (translucent, blur, soft
      shadow, `--radius-md`), hide overflow corners. `thead` translucent, `th` mono/dim uppercase; `td`
      `--text`; `tbody tr:hover` a faint translucent highlight; `.row-id`/`.time-cell`/`.cause-cell` mono
      & muted; `.service-cell i` a small translucent tile; `.table-badge.severity/.status` reuse the same
      tinted-pill palette as step 10. Update `.highlight-row` `@keyframes highlight` to a soft accent
      (blue/lavender) low-alpha pulse. `.footer` + `.brand-mini` to glass/muted palette; keep
      `b.sync-error` coral.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; history table is a translucent glass panel with mono
      metadata, tinted badges, and a soft highlight animation on the newest row.

- [ ] 13. Refine the responsive breakpoints and motion/reduced-motion polish in `styles.css`.
      Update the existing `@media (max-width:1000px)` and `@media (max-width:650px)` blocks so the new
      glass layout degrades cleanly (service grid → 2 cols then 1; simulation capsules stack; analysis
      grid → 2 cols then adjust; the floating header keeps its pill treatment with reduced padding; the
      incident timeline wraps or stacks gracefully; tables keep horizontal scroll). Prioritize the 1440px+
      desktop composition (header → fleet → simulation → active incident → AI analysis above the fold at
      1440/1080). Ensure ALL animations (aurora drift, dot pulse, analysis fade, highlight) are wrapped in
      `@media (prefers-reduced-motion: no-preference)` or disabled under reduced motion. No bouncing or
      large transforms anywhere.
      Files: `frontend/src/styles.css`
      Verify: `cd frontend; npm run build` succeeds; resizing from 1920→1440→1000→650px keeps content
      readable and uncramped; enabling OS "reduce motion" stops the ambient/pulse animations.

- [ ] 14. Final full-app verification pass.
      Run the production build and a dev smoke test; fix any TS/build error introduced by the two JSX/HTML
      edits. Confirm each of the three simulations (DB Failure, CPU Spike, Bad Deployment) still triggers,
      shows the processing banner, and renders the resulting incident + AI analysis; confirm the history
      table and highlight animation still work. Confirm no backend/API/logic files were modified
      (`git status` should show only `frontend/index.html`, `frontend/src/styles.css`,
      `frontend/src/components/IncidentPanel.tsx`, and this plan file).
      Files: (verification only — no new edits expected)
      Verify: `cd frontend; npm run build` exits 0; `npm run dev` loads with no console errors; the three
      scenarios work end-to-end against the existing (unchanged) API/polling code.

## Notes / assumptions

- Timeline: no per-stage timestamps exist in frontend data, so the timeline renders stages only
  (per the brief's explicit fallback). The "Started" metric already shows `createdAt`; that is the only
  real time shown and it is left in place.
- Fonts: Inter + JetBrains Mono via Google Fonts with system fallbacks. If the coder prefers to avoid a
  network dependency, dropping the `<link>`s and relying on the system `--font-sans`/`--mono` stacks is an
  acceptable fallback that keeps the design intact.
- Status color mapping reuses the exact status strings the components already emit (Operational/Degraded/
  Critical, active/investigating/resolved, Critical/High/Elevated/Low/Unscored) so no TS logic changes.
- Scope decision: this is one tightly-coupled design system in a single stylesheet; it is NOT decomposed
  into separate workflow features. The existing implement/review loop should execute this plan directly.
