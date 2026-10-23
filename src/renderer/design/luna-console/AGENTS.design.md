## UI design system: Luna Console

This repo uses the Luna Console design system (`src/design/luna-console/`). Follow it for all UI work.

- Background is always `color-lcars-ground` (black). No cards, borders, shadows, gradients or icons.
- Structure = coloured shapes separated by 4px gaps (`space-1`). The only line is the 2px `color-lcars-divider` above a status line.
- Text on a coloured shape is always ink (black), weight 600, uppercase, aligned bottom-right.
- Text on the ground: values/titles orange, labels lavender, secondary values cream.
- Curves: elbows (`radius-elbow` 56 / `radius-elbow-inner` 26) or half the element height (pills). Rows of pills round only their outer ends.
- One font: `font-lcars` (Antonio). Use the type scale in `tokens.json`; no ad-hoc sizes.
- Numbers: tabular, zero-padded (`064`, `21:07`).
- Status colours (`online`, `armed`) only for state, never decoration. Red = danger.
- States: red alert (connection lost) and yellow alert (bad config) pulse the frame (`.alert-pulse` / `.lc-pulse`) and replace content with `LcNotice`. Destructive commands need two taps (armed → confirm).
- Copy: short uppercase nouns/verbs, command codes `NN-XXX`, alerts name cause and fix.
- No fixed screen sizes. The frame fills its container; layouts adapt with intrinsic grids or container queries.
- Use existing `Lc*` components / `.lc-*` classes before writing new markup; new components reuse tokens only, no literal colours.
