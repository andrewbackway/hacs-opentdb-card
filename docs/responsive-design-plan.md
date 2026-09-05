# Responsive Design Plan

## Scope

Improve only the playable OpenTDB Lovelace quiz card. The visual configuration editor is out of scope.

The primary acceptance viewport is an Amazon Echo Show 5 in landscape at `960 x 480` CSS pixels. The card must also remain usable at `390 x 844` phone portrait and `1024 x 768` desktop or tablet viewports.

## Design Decisions

- The card uses natural height. Exceptionally long questions or answer labels expand the card vertically rather than creating an internal scroll area.
- The card never forces its dashboard container wider or introduces horizontal page scrolling.
- Questions and answer labels wrap when space is limited; readable line length may be capped with `max-width`, but no fixed or minimum content width may exceed the available container width.
- The answer grid remains two columns at the Echo Show target and collapses to one column below the narrow-width breakpoint.
- Existing Home Assistant theme variables, the component-local style block, and the card's current game-show visual language remain in use.

## Implementation Plan

### 1. Define Responsive Layout Constraints

- Ensure the card shell uses `box-sizing: border-box`, `width: 100%`, and `max-width: 100%`.
- Give flex and grid children that contain text `min-width: 0`.
- Use `minmax(0, 1fr)` for flexible grid columns so long content cannot expand the grid beyond its parent.
- Remove the fixed or maximum height constraint from the card wrapper and avoid vertical overflow rules that turn the question content into a scrollable region.

### 2. Make Header Content Adapt

- Keep the card title and quiz name in a flexible title block, with progress as a non-shrinking item on wider layouts.
- Preserve two-line clamping for a long quiz name.
- At a narrow breakpoint, stack or reposition progress so it cannot overlap or compress the title block.
- Keep metadata visually secondary and ensure every header string wraps, truncates, or clamps deliberately.

### 3. Make Question Text Width-Safe

- Keep question copy at `min-width: 0` and use a `max-width` only to limit readable line length on wide displays.
- Let the question wrap normally as width decreases.
- Apply `overflow-wrap: anywhere` to prevent long unbroken strings from causing horizontal overflow.
- Use bounded font sizes and modest narrow-screen reductions rather than viewport-scaled typography.

### 4. Preserve a Stable Answer Grid

- Keep `repeat(2, minmax(0, 1fr))` for the landscape grid.
- Change to a single `1fr` column below the narrow-width breakpoint, initially retaining the existing `560px` threshold and adjusting only after viewport checks.
- Retain fixed marker and icon columns with a flexible, wrapping answer-label column.
- Preserve the existing minimum touch target height and visible keyboard focus state.
- Ensure feedback icons occupy their column before feedback arrives so feedback does not shift labels or resize buttons.

### 5. Handle All Quiz States Responsively

- Verify idle, question, feedback, complete, unavailable, loading, and service-error states share the same width protections.
- Keep feedback readable without forcing the answer grid wider.
- Ensure the completion percentage, summary, leaderboard, and New quiz action wrap or truncate predictably on narrow screens.
- Respect `prefers-reduced-motion` for the incorrect-answer animation.

### 6. Validate the Result

At each target viewport, manually verify:

1. No horizontal page or card scroll appears.
2. Long quiz names, long questions, and long answer labels wrap without overlap.
3. The Echo Show landscape layout presents two answer columns and remains touch-friendly.
4. The phone layout presents one answer column with stable markers, icons, and controls.
5. Feedback, errors, idle, and completion content remain readable as the card grows naturally.
6. Keyboard focus, disabled states, and reduced-motion behavior remain visible and functional.
7. `npm run build` completes and the compiled `opentdb-card.js` is reloaded without browser caching.

## Acceptance Criteria

- At `960 x 480`, ordinary quiz content is readable with two answer columns and no horizontal scrolling.
- At `390 x 844`, all question and answer text remains within the card and answer choices use one column.
- A long unbroken question or answer string cannot widen the card beyond its parent.
- Long content increases card height naturally instead of being clipped or requiring an internal question-region scrollbar.