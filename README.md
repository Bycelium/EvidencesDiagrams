# `@bycelium/evidences-diagrams`

Combine evidence, measure dissonance, and explore how prior beliefs change the result.

[Open the live demo](https://evidences.bycelium.com) · [Download the standalone demo](https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/demo/index.html)

**Add evidence**

![Add evidence](https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/adding-evidence.gif)

**Change the prior**

![Change the prior](https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/changing-prior.gif)

**Adjust evidence weights**

![Adjust evidence weights](https://raw.githubusercontent.com/Bycelium/EvidencesDiagrams/main/images/changing-weight.gif)

The demo supports English and French, with editable categories and illustrative weights. The downloaded HTML works offline.

## Install

```bash
pnpm add @bycelium/evidences-diagrams
```

<details>
<summary>API reference</summary>

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
diagram.resultant.jeffreysBand; // 'moderate'
boundProbability(summary).direction; // 'lower'
```

| Export | Purpose |
|---|---|
| `aggregateEvidence(weights)` | Returns net weight, absolute weight, and dissonance. |
| `probabilityToDecibans({ probability })` | Converts probability to decibans. |
| `decibansToProbability({ weightDecibans })` | Converts decibans to probability. |
| `boundProbability(summary, options?)` | Returns a conservative, exact, or indeterminate probability. |
| `buildEvidenceDiagram(evidence, options?)` | Returns a render-independent diagram model. |
| `jeffreysBand({ weightDecibans })` | Names the Jeffreys band for an evidence weight. |
| `DEFAULT_COLOR_OPTIONS` | Provides default color settings. |
| `color`, `triangleColor`, `trianglePosition` | Provide diagram color and legend values. |

`EvidenceWeight` has `weightDecibans`. `EvidenceSummary` has
`netWeightDecibans`, `absoluteWeightDecibans`, and `dissonance`.
`ProbabilityBoundsOptions` accepts `minPriorDecibans` and `maxPriorDecibans`.
The default prior interval is `[-15, +15] dBan`.

</details>

<details>
<summary>Development and localization</summary>

```bash
pnpm install
pnpm build:demo
pnpm check
```

`build:demo` bundles the demo into `demo/index.html`; `check` runs the project
checks and consumer installation test. To add a locale, create a dictionary in
`demo/locales/` and register it in `demo/i18n.js`. To add a category, update
`demo/category-state.js` and each locale dictionary.

</details>

MIT. See [LICENSE](LICENSE).
