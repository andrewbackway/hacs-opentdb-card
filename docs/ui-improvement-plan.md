# OpenTDB Card UI Improvement Plan

## Goal

Make the OpenTDB Lovelace card feel intentional and readable on an Amazon Echo Show 5 running Home Assistant, while keeping it usable on ordinary desktop and mobile dashboards. The primary target is a landscape viewport around 960 x 480 CSS pixels, with touch input, a short visible height, and viewing distance greater than a phone or desktop monitor.

## Current Problems

- The card has no component-owned styling or responsive layout rules. Its height and wrapping are determined by browser defaults and the length of the question and answers.
- A long question can push the answer controls and score footer below the visible Echo Show viewport.
- Answer buttons do not have a stable grid, minimum touch target, or clear selected/disabled/feedback states.
- The header uses a plain title and progress string, with no deliberate hierarchy for a glanceable display.
- The empty, idle, active, feedback, and complete states do not share a clearly designed visual system.
- There is no browser-level visual or interaction test for the Echo Show viewport.

## Proposed Experience

### 1. Establish a compact Echo Show layout

- Treat the card as a bounded, responsive surface rather than an unconstrained document fragment.
- Use a compact header with the quiz name on the left and progress on the right.
- Keep the question as the visual focus, with a controlled maximum height and a readable line length.
- Use a two-column answer grid in landscape layouts and a single column when the available width is narrow.
- Keep the score visible without competing with the question or answers.
- Define spacing, typography, borders, and colors with CSS variables so the card can follow Home Assistant themes while retaining reliable contrast.
- Prefer a restrained height budget for the 480-pixel-tall target. The design should degrade by wrapping text, not by allowing controls to disappear below the viewport.

### 2. Make touch interaction dependable

- Give every answer and primary action a stable, generous touch target appropriate for an Echo Show.
- Make the entire answer button readable at a glance, including long labels.
- Preserve a visible disabled state while an answer is being submitted.
- Show feedback in a dedicated status region with color and text, never color alone.
- Avoid controls that depend on hover, pointer precision, or a keyboard-only affordance.
- Ensure focus indicators remain visible for keyboard and accessibility tooling.

### 3. Design each card state

- **Empty/configuration:** concise explanation that an OpenTDB quiz entity is required; avoid an oversized blank panel.
- **Idle:** strong quiz title, brief current setup context if available, and one clear Start quiz action.
- **Question:** question, progress, answer grid, feedback, and score in a predictable order.
- **Submitting/feedback:** prevent duplicate submissions, retain the question, and show the result until the next question is available.
- **Complete:** percentage and elapsed time as the primary result, answered/correct count as supporting detail, and a clear New quiz action.
- **Missing related entities or malformed attributes:** render a useful fallback state instead of blank text or broken controls.

### 4. Make the card naming hierarchy clear

- Show both the configured card name and the quiz name in the card header, with distinct hierarchy so neither is mistaken for an entity ID.
- Keep entity IDs out of the main visual hierarchy; they are configuration details, not presentation content.
- Keep the naming treatment compact enough that long quiz names do not displace progress or controls.

### 5. Theme and accessibility checks

- Respect Home Assistant theme variables where available and provide sensible fallbacks.
- Verify contrast for normal text, muted metadata, buttons, feedback, and disabled controls.
- Use semantic headings, button labels, and a live status region for feedback.
- Do not rely on color or iconography alone to communicate correctness.
- Check text scaling and long translations without clipping or overlapping controls.

## Implementation Order

1. Show both the configured card name and the quiz name in the card header.
2. Add focused game-show styling and responsive layout structure in the TypeScript source, then regenerate the root compiled artifact through the existing build command.
3. Add robust text handling for long questions and answer labels, plus explicit loading, feedback, and complete states.
4. Tune touch targets, focus states, contrast, and reduced-motion behavior for an Echo Show.
5. Add a browser-level smoke/visual check for 960 x 480, a narrow mobile width, and a desktop width. Include long questions, long answers, idle, active, feedback, and complete states.
6. Run `npm run build`, inspect the generated artifact, and perform the viewport checks before release.

## Acceptance Criteria

- At 960 x 480, the active question state keeps the question, all answer controls, and score visible without page-level horizontal scrolling.
- The answer grid remains stable when labels wrap, and every answer remains easy to tap.
- Long question and answer text wraps cleanly without overlapping the progress, feedback, or footer.
- Idle, active, feedback, complete, and missing-entity states are visually distinct and usable.
- The card remains legible in light and dark Home Assistant themes and at increased text size.
- The source and compiled artifact stay synchronized through the existing build process.
- The changes are validated at the target Echo Show viewport and at least one narrow viewport.

## Questions Before Implementation

The key product decisions are settled:

- The layout should fit all four answers on screen where practical and scroll only as a last resort.
- The visual direction is game-show-like.
- The card should show both the card name and the quiz name.
- Scope is limited to card presentation and naming; no quiz settings or integration changes belong in this UI plan.
