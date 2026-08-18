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
node tools/og.mjs            # regenerate public/og/*.png social cards
```

Headless Chromium renders WebGL through SwiftShader, so the frame numbers are a
software-rasteriser floor, not a prediction for real hardware. They are for
catching regressions, not for bragging.

## The lines that are yours to change

Everything below is Preet's own copy rather than invented brand fiction. Change
these and nothing else needs to move.

**`index.html`**

- `<title>` and the `og:`/`twitter:` meta block — name and role.
- The nav brand and the `PK` monogram (also in `src/lib/back-link.html`, which
  is pasted verbatim into all six demos).
- Hero: the eyebrow (`Interaction designer & creative developer`), the headline,
  the lede, and the footer strip — `Bengaluru · working worldwide`,
  `Available for new projects`.
- `03 · About` and `04 · Process`: the story, the numbers, the four steps.
- `05 · Contact`: the `mailto:` on `#mailBtn`, the `data-copy` and label on
  `#copyMail` (both currently `preetkr.2002@gmail.com`), and the four cards —
  availability, good-fit-for, how I work, timezone.
- Footer credit line and the `Bengaluru` in `.foot__meta`.

**`public/og/portfolio.png`** is a screenshot of the hero, so it regenerates
itself: change the hero copy, run `node tools/og.mjs`, done.

The six demo sites need no personalising. They are portfolio pieces, and each
already discloses in its footer that the brand is a fiction made by Preet Kumar.

## How it is put together

Vite in MPA mode: seven HTML entries, one shared module graph, `three` split
into its own chunk so the two non-WebGL sites never download it.

```
src/lib/         the shared runtime, used by all seven pages
  ticker.js      one rAF loop, priority-ordered, stops on tab blur
  scroll.js      damped scroll signal + GSAP-style scroll tracks
  gl.js          Three.js stage: DPR caps, visibility pausing, context loss
  env.js         device tier (low/mid/high) → quality knobs
  reveal.js      IntersectionObserver entrance reveals
  split.js       masked-line typography
  math.js        clamp, lerp, damp, easings, seeded rng
  glsl.js        simplex noise, fbm, dither, hash
  ui.js          magnetic buttons, marquees, count-ups, cursor, tilt
  base.css       reset, reveal system, the back-to-portfolio pill
src/<site>/      one folder per site: its CSS, its main.js, its scene
demos/<site>/    one index.html per site
tools/           QA, screenshots, interaction rehearsals, social cards
```

Two things learned the hard way are documented in the code where they bite:
`scroll.js` explains why you must never write `if (progress > 0)` against a
damped value, and `src/portfolio/main.js` explains why `offsetTop` lies about
sticky elements.
