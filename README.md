# Preet Kumar — portfolio, and six worlds inside it

One site. The portfolio opens first; six complete demo websites live inside it
and can be opened, scrolled and played with. Every one of them is a scroll-told
story with a single signature interaction, and every one of them is a different
designer's handwriting — different niche, mood, type, palette, layout and
motion.

```
/                      the portfolio
/demos/aurelis/        01 · luxury watchmaker
/demos/aetherion/      02 · deep-field passenger flight
/demos/noise94/        03 · streetwear drop
/demos/cendre/         04 · wood-fired restaurant
/demos/mossfoot/       05 · indie game studio
/demos/volume-zero/    06 · architecture practice
```

## The six, and what each one is remembered for

| # | Site | Signature moment |
|---|------|------------------|
| 01 | **Aurelis**, Genève | The watch opens: 214 components lift out of the case into an exploded calibre as you scroll, then settle back. |
| 02 | **Aetherion** | You fly. Stars stretch into warp streaks, a gas giant crosses the frame, and night turns to day around you. |
| 03 | **NOISE94** | The drop is sealed. You have to physically tear the poster open with your finger to see it. |
| 04 | **Cendre**, Ardèche | The pass. Each course flies in, orbits, plates itself on the ceramic and lifts away as the next begins. |
| 05 | **Mossfoot Games** | Pip. The studio's moss sprite follows your cursor the whole way down the page, blinks, flinches when you get too close, cheers when you click, and falls asleep if you leave. |
| 06 | **Volume Zero**, København | A house builds itself. Site, foundation, floor, frame, roof, envelope — an orthographic axonometric assembling slab by slab. |

All six brands are inventions. Each one says so in its own footer, and each one
carries the same pill in the bottom-left corner that returns to the portfolio,
so nobody can get lost inside a demo.

## Everything here was drawn in code

There is not one photograph, stock image, model download or icon font in this
repository. Every mark on all seven sites — the watch, the planets, the food,
the characters, the house, the posters, the textures — is authored: WebGL
geometry, canvas, or hand-written SVG paths. `imgs=0` on every page in the QA
sweep, and it stays that way.

Type is the one exception, and it is loaded from Google Fonts: Instrument Serif,
Inter Tight, JetBrains Mono, Cormorant Garamond, Jost, Space Grotesk, IBM Plex
Mono, Archivo Black, Space Mono, Fraunces, Karla, Fredoka, Nunito, Archivo,
DM Mono.

## The two rules everything was built against

**Flawless on a phone.** Most people open a portfolio link on a phone first.
Every page is checked at 390×844 as well as 1440×900: no horizontal overflow
anywhere, tier-based quality (a phone never renders at 3× or with antialiasing
it cannot afford), touch alternatives for every hover, and `svh` units so the
address bar cannot make anything jump.

**Smooth beats fancy, every time.** One `requestAnimationFrame` loop for the
whole page. Native scrolling is never hijacked — `window.scrollY` is sampled
once a frame and exponentially damped, which gives the scrub feel without
costing momentum, battery or accessibility. Rendering stops the moment a canvas
leaves the viewport. Where a nicer effect cost frames, the effect lost.

## Where it lives

- **Repository** — `AfkPreet/demo-sites`, branch `claude/preet-kumar-portfolio-ytu9f0`.
- **Vercel project** — `preet-kumar-portfolio` (team *PREET'S Team*), already
  linked to this repository.
- **URL** — <https://preet-kumar-portfolio-preet-s-team.vercel.app>

A production deployment was created from a snapshot of this branch. Vercel's
git integration is what should own it from here: merge this branch into `main`
(the project's production branch) and every push rebuilds and redeploys on its
own. Alternatively, point the project's Production Branch at this branch in
Vercel → Settings → Git.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run preview    # serve the build on :4173
```

### The QA tools

They all run against a `npm run preview` server.

```bash
node tools/qa.mjs --all      # every page, phone + desktop: overflow, console,
                             # frame times, back-link, doc height
node tools/links.mjs         # every link, every #anchor, accessible names
node tools/shots.mjs /demos/cendre/ ".hero,.pass"    # section screenshots
node tools/interact.mjs /demos/noise94/ tear         # rehearse an interaction
node tools/og.mjs            # regenerate public/og/*.jpg social cards
```

Headless Chromium renders WebGL through SwiftShader, so the frame numbers are a
software-rasteriser floor, not a prediction for real hardware. They are for
catching regressions, not for bragging.

## The portfolio's art direction

The portfolio is called **CAST**. It is a studio photograph rather than a web
page: mid-value limestone ground — deliberately neither black nor white, which
is the one value that cannot collide with any of the six demos it has to
introduce, since they all sit at one end of the scale or the other — and a
single fixed key light, upper-right and well to the side, that governs
everything on the page. The hero object, every chamfer, every cast shadow in
CSS falls the same way, from `--shadow-x` / `--shadow-y`. Ultramarine appears
exactly once, on the contact field, and nowhere else. Nothing has a corner
radius.

The hero is two draw calls and no downloaded assets: a studio sweep, and an
extruded plaster slab with the name debossed into it. The relief is
reconstructed from a height field by screen-space derivatives, so there is no
normal map to bake. The slab's four corners are cast along the key onto the
sweep and projected to the screen, and the headline carries
`mix-blend-mode: multiply` — so the shadow travels *through* the letterforms
rather than behind them. That is the whole argument of the page: the type and
the object are provably in one lighting environment.

If you move the light, move it in `src/portfolio/hero.js` (`LIGHT`) **and** in
the `--shadow-x` / `--shadow-y` tokens and the chamfer borders in
`src/portfolio/portfolio.css`. They are one decision expressed in two places.

## The lines that are yours to change

Everything below is Preet's own copy rather than invented brand fiction. Change
these and nothing else needs to move.

**`index.html`**

- `<title>` and the `og:`/`twitter:` meta block — name and role.
- The nav brand, and the `PK` monogram in `src/lib/back-link.html` (pasted
  verbatim into all six demos).
- Hero: the headline, the lede, and the baseline strip
  (`Available now` / `Six demonstrations below`).
- `02 · Work`: the six plates — each one's index, name, description and tags.
- `03 · Studio`: the three paragraphs, and **The kit** — the six-row colophon of
  what actually gets used.
- `04 · Process`: the five steps, and the deliverable each one names at the
  right of its rule.
- `05 · Contact`: the `mailto:` on `.mail` (currently `preetkr.2002@gmail.com`,
  with a pre-filled subject and body), the four `.facts` rows — reply time,
  base, availability, rate — and the colophon line.

**The deboss** — the name cut into the slab is drawn in `debossCanvas()` in
`src/portfolio/hero.js`, not in the HTML. It has two cuts: the full one, and a
`tight` one for phones that drops a line and sets the rest larger, because a
card 280 css pixels wide cannot hold two lines of 8px letterpress.

**`public/og/*.jpg`** are screenshots of the pages themselves, so they
regenerate: change anything, run `node tools/og.mjs`, done.
