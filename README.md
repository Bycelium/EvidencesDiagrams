# `@bycelium/evidences-diagrams`

Dependency-free ESM utilities for aggregating weights of evidence in decibans,
measuring dissonance, and building a render-independent evidence-diagram model.
The package has an English API. The demo supports English and French; its French
labels use *poids des preuves* and *dissonance*.

```bash
pnpm add @bycelium/evidences-diagrams
```

## Standalone demo

[Download the standalone demo](https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/demo/index.html)
and open it locally. It works over `file://` without a server or network access.
From a repository checkout, open `demo/index.html` directly.

The demo stores the selected language in `localStorage` when available. It keeps
the current evidence, scenario, prior bounds, and color settings while switching
languages. Storage failures are ignored, so restrictive browser settings keep
the diagram usable.

## Model

For independent signed evidence weights `wᵢ`, the package calculates:

- `S = Σ wᵢ`, the net weight.
- `A = Σ |wᵢ|`, the absolute weight.
- `D = 1 − |S| / A`, the dissonance, with `D = 0` when `A = 0`.

For example, `+9 dBan` and `−1 dBan` produce `S = +8 dBan`, `A = 10 dBan`,
and `D = 20%`. Decibans are log odds: `+10 dBan` multiplies the odds by ten.
For probability `p`:

```text
d = 10 × log10(p / (1 − p))
p = 1 / (1 + 10^(−d / 10))
```

A prior interval `[min, max]` is expressed in decibans. Net evidence translates
it to `[min + S, max + S]`, then each endpoint is converted to probability. The
conservative probability uses the lower endpoint for positive evidence and the
upper endpoint for negative evidence. Equal bounds produce an exact probability.

## API

```ts
import {
  aggregateEvidence,
  buildEvidenceDiagram,
  boundProbability,
} from '@bycelium/evidences-diagrams';

const evidence = [
  { id: 'report', weightDecibans: 12 },
  { id: 'counter-analysis', weightDecibans: -5 },
];

const summary = aggregateEvidence(evidence);
summary.netWeightDecibans; // 7
summary.absoluteWeightDecibans; // 17
summary.dissonance; // 10 / 17

const diagram = buildEvidenceDiagram(evidence);
diagram.steps[1].end; // { netWeightDecibans: 7, absoluteWeightDecibans: 17 }
diagram.resultant.jeffreysBand; // 'moderate'
diagram.probability.text; // 'Probability ≥ 13 %'

boundProbability(summary).direction; // 'lower'
```

| Export | Purpose |
|---|---|
| `aggregateEvidence(weights)` | Returns net weight, absolute weight, and dissonance. |
| `probabilityToDecibans({ probability })` | Converts probability to decibans. |
| `decibansToProbability({ weightDecibans })` | Converts decibans to probability. |
| `boundProbability(summary, options?)` | Returns a conservative, exact, or indeterminate probability. |
| `buildEvidenceDiagram(evidence, options?)` | Returns a render-independent diagram model. |
| `jeffreysBand({ weightDecibans })` | Returns `none`, `anecdotal`, `moderate`, `strong`, `very strong`, or `decisive`; negative nonzero bands end with ` against`. |
| `color`, `triangleColor`, `trianglePosition` | Provide diagram color and triangular-legend values. |
| `DEFAULT_COLOR_OPTIONS` | Provides default color settings. |

`EvidenceWeight` has `weightDecibans`. `EvidenceSummary` has
`netWeightDecibans`, `absoluteWeightDecibans`, and `dissonance`. `Probability`
has `probability`. `ProbabilityBoundsOptions` accepts `minPriorDecibans` and
`maxPriorDecibans`. `ColorOptions` adds `saturationThresholdDecibans` and
`anchors.gray`, `anchors.yellow`, `anchors.green`, and `anchors.red`.

Numeric `ProbabilityBound` values have `direction` (`lower`, `upper`, or
`exact`), `probability`, `displayPercentage`, and English `text`. An
indeterminate value has `direction: 'indeterminate'`, a `reason` of
`'no-evidence'` or `'dissonant-evidence'`, and English `text`.

The default prior interval is `[-15, +15] dBan`. The diagram keeps raw decibans
in its steps and resultant so a consumer can choose its own projection.

## Demo extension

The seven visible defaults are Testimony, News report, Fact-check, Encyclopedia,
Official document, Official data, and Scientific study. Advanced study methods
are available as optional category presets: Observational study, Controlled
experiment, Randomized controlled study, Double-blind randomized study,
Independent replication, Systematic review, and Meta-analysis. Custom category
names are also supported. News aggregator is available as an optional preset.

Each category starts with an illustrative `±10 dBan` control. These adjustable
example weights support exploration of evidence mechanisms and bias controls.
Calibration needs application-specific data, and the categories carry no built-in
ranking of source types: observational studies face confounding; controlled and
randomized designs help address it; blinding reduces expectancy effects;
independent replication tests a finding
with new data; systematic reviews use explicit selection methods; meta-analysis
combines numerical results. See the [Cochrane Handbook](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-01)
and the [National Academies report on reproducibility and replicability](https://www.nationalacademies.org/read/25303/chapter/4)
for the terminology behind these distinctions.

The demo supports pointer controls, keyboard controls, and matching ARIA text.

To add a locale, create a locale dictionary module and add one import and entry
to `localeRegistry` in `demo/i18n.js`. Each dictionary exports `meta` and
`messages`; message values may be strings or plural dictionaries keyed by
`Intl.PluralRules` categories. English remains the fallback. Application and
renderer code need no locale-specific changes.

To add a category, add its data in `demo/category-state.js` and its labels and
descriptions to every locale dictionary in `demo/locales/`. The category registry
owns state and preserves snapshots; locale dictionaries own displayed text.

## Demo walkthrough

### No evidence and the color legend

<img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/no-evidence.png" width="360" alt="Initial diagram with no evidence, a net weight of zero decibans, and a prior interval.">

With no evidence, the result is `none (0 dBan)`. The prior band is visible and
the probability remains indeterminate. The color legend places dissonance at the
top, evidence against at the left, evidence for at the right, and no evidence at
the center.

<img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/color-legend.png" width="360" alt="Triangular color legend showing dissonance, evidence against, no evidence, and evidence for.">

### Adding and combining evidence

<img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/add-evidence.png" width="640" alt="Evidence controls and one supporting news report with a weight of plus ten decibans.">

Choose a category, set its supporting or opposing weight, and add it to the
history. Editing a category control updates its existing evidence entries of the
same category and direction. The history supports selection and removal.

<img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/weak-evidence.png" width="360" alt="Gray result for weak supporting evidence that leaves the posterior interval across fifty percent.">

Weak evidence can remain gray when the posterior interval crosses 50%.

| Evidence for | Evidence against |
|---|---|
| <img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/positive-agreement.png" width="360" alt="Green result for converging evidence for a claim."> | <img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/negative-agreement.png" width="360" alt="Red result for converging evidence against a claim."> |
| `+10 +10 +10 = +30 dBan` | `−10 −10 −10 = −30 dBan` |

The resultant starts at the conservative prior endpoint and ends at the posterior
odds used for the displayed probability.

### Conflicting evidence and prior bounds

<img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/evidence-path.png" width="360" alt="Evidence path for alternating supporting and opposing entries.">

The ribbon retains the cumulative path, so opposing evidence remains visible.

<img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/dissonant-evidence.png" width="360" alt="Yellow result for completely dissonant evidence with zero net weight.">

Yellow identifies dissonance: equal and opposing weights cancel in the net
weight while remaining in the absolute weight.

| Prior interval | Exact prior |
|---|---|
| <img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/prior-interval.png" width="360" alt="A positive evidence weight evaluated across a prior interval."> | <img src="https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/exact-prior.png" width="360" alt="The same positive evidence weight evaluated with an exact prior."> |

Move the prior handles or use the keyboard to change each bound. Equal bounds
form an exact prior and expose one reusable handle.

## Development

Install Node.js `>= 24.3.0` and pnpm `10.20.0`, then run:

```bash
pnpm install
pnpm build:demo
```

`build:demo` bundles the demo into `demo/index.html`. `pnpm check:demo` verifies
that the committed standalone file is current. `pnpm check` runs tests, type
checking, the demo check, and a consumer installation test from the npm archive.
`pnpm build` removes `dist/` before TypeScript emits files, preventing renamed
source files from being included in a later package archive.

## Publishing to npm

The first publication of version `1.0.0` (Git tag `v1.0.0`) is manual. The publisher needs npm
permission for the public `@bycelium` scoped package.

```bash
npm login
npm whoami
pnpm check
npm pack
npm publish --access public
```

Enable two-factor authentication and confirm organization membership before
publishing. After `1.0.0` is available, configure npm trusted publishing for
GitHub owner `Bycelium`, repository `EvidencesDiagrams`, workflow `publish.yml`,
and no environment unless one is later configured. Stable releases then publish
through OIDC in `.github/workflows/publish.yml`: update the version in a pull
request, merge it, and create a stable GitHub Release tagged `v` plus that
version. The workflow verifies the tag, runs `pnpm check`, and publishes with
npm provenance.

MIT. See [LICENSE](LICENSE).
