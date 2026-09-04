# OpenTDB Card UI Improvement Plan

## Goal

Make the OpenTDB Lovelace card feel intentional and readable on an Amazon Echo Show 5 running Home Assistant, while keeping it usable on ordinary desktop and mobile dashboards. The primary target is a landscape viewport around 960 x 480 CSS pixels, with touch input, a short visible height, and viewing distance greater than a phone or desktop monitor.

Scope is limited to card presentation and interaction. It does not include integration entities, service registration, or quiz settings.

## Existing Baseline

The current source already has a first game-show treatment: a teal background, coral primary action, yellow accent, separate card and quiz names, two-column answers that collapse to one column at `560px`, `58px` minimum answer controls, and a `460px` scrollable card-body cap. The remaining work is to make this implementation safe, deterministic, and genuinely fitted to the Echo Show viewport.

## Handoff Constraints

The implementing model must follow these boundaries:

- Change only `src/opentdb-card.ts`, `README.md` when user-visible configuration or behavior changes, and generated `opentdb-card.js` via `npm run build`.
- Do not edit `package.json`, `package-lock.json`, `hacs.json`, TypeScript compiler settings, or add packages for this work.
- Do not change the public card configuration shape: it remains `entity` plus optional `title`.
- Do not add configuration fields for colors, related entities, quiz options, timers, or animation.
- Do not modify `C:\git\hacs-opentdb`; any integration changes are outside this plan.
- Do not use a framework, shadow root, external CSS file, or inline SVG. Use the existing custom element, component-local `<style>`, and Home Assistant's built-in `ha-icon` element for feedback icons.
- Preserve Home Assistant theme variables. Card-specific fallback colors are allowed, but no color picker or theme configuration UI is added.
- Use ASCII source text. The existing `·` in the current completion text may be replaced with ASCII rather than adding new Unicode characters.

## Data And State Contract

The implementation must preserve the current entity relationship and service calls.

| Value | Source | Required for |
| --- | --- | --- |
| Quiz state | `hass.states[config.entity]` | All rendered states |
| Quiz title | `quiz_name`, then `friendly_name`, then `Trivia Quiz` | Header |
| Card title | `config.title`, then `Open Trivia DB Quiz` | Header label |
| Question | `${prefix}_question.attributes.question` | Active and feedback states |
| Answers | `${prefix}_question.attributes.answers` | Active and feedback states |
| Correct answer | `${prefix}_question.attributes.correct_answer` | Feedback reveal only |
| Progress | Quiz `question_index` and `total_questions` | Active and feedback states only |
| Feedback result | Quiz `feedback.correct` | Feedback state only |
| Score | `${prefix}_score.attributes.correct`, `.answered`, `.percentage` | Footer and completion |
| Elapsed time | `${prefix}_elapsed_time.state` | Completion |

`prefix` remains `entity.replace(/_quiz$/, "")`. Do not change suffix derivation or attempt to compensate for Home Assistant entity-name collisions in the card.

Use an explicit view-state resolver with this precedence:

1. `unconfigured`: no `config.entity`.
2. `unavailable`: configured quiz entity is absent, unavailable, or unknown.
3. `idle`: quiz state is `idle`.
4. `complete`: quiz state is `complete`.
5. `feedback`: an active quiz has a valid feedback object.
6. `question`: an active quiz has a question string and at least two answer strings.
7. `loading`: quiz exists but related question data is not ready.

Use `loading`, not a misleading empty answer grid, when the quiz is between questions or related state has not propagated. The component must not throw when an attribute is absent or has an unexpected type.

## Rendering Specification

### Safe Text

All values originating from `hass.states` are untrusted display text. Escape text before any interpolation into `innerHTML`.

```ts
private escapeHtml(value: unknown): string {
	return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
	})[character]!);
}
```

Call this helper for every quiz name, card title, question, answer, error message, and string attribute placed in template markup, including values used in attributes such as `aria-label` and `data-*`. Do not decode or inject OpenTDB HTML yourself; render the integration-provided strings as literal text.

Do not use a raw answer string as `data-answer`. Preserve the answer index in `data-answer-index`, then read the original in-memory `choices[index]` when submitting. The service payload must continue to receive the original, unescaped answer string.

### Common Card Shell

Every view state must render this outer shape so empty and error states keep the same visual treatment:

```html
<style>...</style>
<ha-card>
	<div class="wrap state-question">
		<header>...</header>
		<main>...</main>
		<footer>...</footer>
	</div>
</ha-card>
```

Use a state class on `.wrap` such as `state-idle`, `state-question`, `state-feedback`, `state-complete`, or `state-unavailable`. This enables state-specific layout without duplicate card markup.

The header must contain:

```html
<div class="title-block">
	<div class="card-name">Open Trivia DB Quiz</div>
	<div class="quiz-name">...</div>
</div>
<div class="progress">Question 3 of 10</div>
```

Always show the fallback card label when `title` is absent. Only render `.progress` for `question` and `feedback` states with a numeric total greater than zero. `title-block` needs `min-width: 0`; `.quiz-name` must clamp to two lines; `.progress` must use `flex: 0 0 auto` and `white-space: nowrap`.

### Question And Feedback Markup

The active and feedback states must use one `.question-region` containing `.question-copy`, `.answers`, and feedback status. That region is the only scrollable content region in a constrained Echo Show layout.

```html
<main class="question-region" aria-busy="false">
	<div class="question-copy"><h2>...</h2></div>
	<div class="answers" role="group" aria-label="Answer choices">...</div>
	<div class="feedback" role="status" aria-live="polite">...</div>
</main>
```

For each answer, render the marker, label, and icon containers even before feedback so the grid does not jump when feedback arrives. The icon container can be visually empty until feedback.

```html
<button class="answer answer-selected answer-incorrect" data-answer-index="1"
	aria-label="B. Paris" aria-pressed="true" disabled>
	<span class="answer-marker">B</span>
	<span class="answer-label">Paris</span>
	<ha-icon class="answer-icon" icon="mdi:close-circle"></ha-icon>
</button>
```

Use `mdi:check-circle` for a correct answer and `mdi:close-circle` for an incorrect answer. In feedback state:

- The selected correct answer gets `answer-selected answer-correct`, a green check icon, and `aria-pressed="true"`.
- The selected incorrect answer gets `answer-selected answer-incorrect`, a red close icon, and `aria-pressed="true"`.
- The answer whose original string exactly equals `correct_answer` gets `answer-revealed-correct`, a green check icon, and an accessible label stating it is the correct answer.
- Every answer stays disabled until the next quiz state arrives.
- If `correct_answer` is absent, show text feedback only; do not guess or label an answer correct.

## Interaction And Timer Rules

Add only local private fields in `OpenTdbCard`:

```ts
private _submitting = false;
private _serviceError?: string;
private _feedbackTimer?: number;
```

The answer click handler must follow this order:

1. Return immediately when `_submitting`, feedback, or the indexed answer is missing.
2. Set `_submitting = true` and clear `_serviceError`.
3. Render immediately so all answer buttons are disabled and the question region is `aria-busy="true"`.
4. Await `submit_answer` with the original answer string and the current question index.
5. On failure, set a user-facing error such as `Couldn't submit that answer. Try again.`, set `_submitting = false`, and render again.
6. Do not call `next_question` until feedback exists in a later Home Assistant state update. When feedback exists, schedule at most one `next_question` call after `900ms`.
7. Before scheduling, clear any previous timer. In `disconnectedCallback()`, clear the timer and reset `_submitting`.

The current implementation schedules `next_question` as soon as `submit_answer` resolves. The implementing model must change that behavior: service success is not proof that the card has received feedback. Schedule only from the feedback render path, guarded so a rerender cannot schedule duplicate advancement.

For incorrect feedback, add `.shake` to `.question-region` for a single short animation, around `220ms`. The animation must be disabled by:

```css
@media (prefers-reduced-motion: reduce) {
	.question-region.shake { animation: none; }
}
```

Do not use animation loops, autoplay sounds, or any motion for correct answers.

## CSS And Layout Rules

Keep all CSS within the existing `<style>` emitted by the component. Introduce component variables once and reference them consistently:

```css
:host {
	--opentdb-card-height: 390px;
	--opentdb-gap: 12px;
	--opentdb-answer-min-height: 56px;
	--opentdb-accent: #ffd06f;
	--opentdb-primary: #ef715d;
	--opentdb-correct: #227d70;
	--opentdb-incorrect: #a64545;
}
```

- Keep the dark teal game-show background; use Home Assistant text and card-background variables where they provide suitable contrast.
- Keep radii at `8px` or lower. Do not introduce large pill controls or nested cards.
- `.wrap` is a grid with a fixed header/footer and a `minmax(0, 1fr)` middle row. It may be height-capped near `390px` for Echo Show behavior.
- `.question-region` must use `min-height: 0; overflow: auto; overscroll-behavior: contain;` so it, rather than the page, receives exceptional content scrolling.
- `.answers` remains `repeat(2, minmax(0, 1fr))` above `560px` and becomes `1fr` below it.
- Answer buttons use `display: grid` with a fixed marker column, flexible label column, and fixed icon column. This prevents icons or long labels from shifting the grid.
- Preserve a visible `:focus-visible` outline. Hover styling may remain but cannot be the only interactive feedback.
- Disabled and feedback button states must meet readable contrast against the background.

## Manual Home Assistant Validation

No test harness, test dependency, screenshot baseline, or browser automation is to be added. Validate manually in Home Assistant after each completed UI pass.

1. Open the card at the Echo Show 5 target size (`960 x 480`) and confirm no horizontal page scroll.
2. Start a quiz with a short question and verify all answers, progress, and score are visible.
3. Use a question with a long title, a long quiz name, and two-line answer labels; confirm the title does not overlap progress and the question region scrolls as a whole only when required.
4. Select the correct answer and verify its green check, `Correct` status, disabled grid, and one automatic advance.
5. Select an incorrect answer and verify the red close icon, `Incorrect` status, correct-answer reveal, one brief shake, disabled grid, and one automatic advance.
6. Trigger an unavailable quiz entity, missing related question entity, and a rejected service call. Confirm each has a styled, readable fallback and that a failed submission can be retried.
7. Check idle and complete states. Idle must not show `Question 1 of 0`; complete must present percentage, score, elapsed time, and New quiz action.
8. Repeat the active state check at `390 x 844` and `1024 x 768`. The narrow view should become one answer column without overlap.
9. Enable reduced motion in the client/browser and verify an incorrect answer does not shake.
10. Verify text containing `<b>Not markup</b> & "quoted"` displays as literal text in one answer button.
11. Run `npm run build` and reload the Home Assistant resource without cache before final approval.

## Current Problems

- The global scrollable `460px` content area is almost the whole Echo Show viewport before dashboard padding and card margins are counted. Long content can still bury the answer controls.
- Quiz-supplied names, questions, and answers are interpolated straight into `innerHTML`. Content with markup-like characters can corrupt the layout and becomes an injection risk.
- Buttons are only disabled after integration feedback arrives, so rapid repeated taps can submit more than one answer.
- Service failures are ignored and the feedback timer is not cleared when the card re-renders or disconnects.
- Header text does not have a defined two-line clamp or `min-width: 0`, allowing a long card or quiz name to crowd progress.
- Empty and unavailable paths do not use the same styled shell, and incomplete quiz data can show misleading values such as `1 / 0`.
- There is no browser-level visual or interaction test for the Echo Show viewport.

## Proposed Experience

### 1. Establish a compact Echo Show layout

- Treat the card as a bounded, responsive surface rather than an unconstrained document fragment.
- Use a compact header with the quiz name on the left and progress on the right.
- Keep the question as the visual focus, with a controlled maximum height and a readable line length.
- Use a two-column answer grid in landscape layouts and a single column when the available width is narrow.
- Keep the score visible without competing with the question or answers.
- Define spacing, typography, borders, and colors with CSS variables so the card can follow Home Assistant themes while retaining reliable contrast.
- Prefer a restrained height budget for the 480-pixel-tall target. Keep all four answers visible in ordinary use; for exceptional content, allow the whole question region to scroll as a unit.

Implementation detail:

- Define card-owned CSS variables for height budget, gaps, colors, and answer minimum height at the beginning of the style block.
- Use a target card-body maximum near `390px`, not `460px`, so Home Assistant framing has room on a `480px` display.
- Restructure the active state into named regions: header, `.question-region`, `.question-copy`, `.answers`, `.feedback`, and score.
- Keep header and score non-shrinking. Give `.question-region`, containing the question, answers, and feedback, controlled overflow for exceptional content.
- Keep the two-column grid at the Echo Show target and switch to one column only below `560px`.
- Use fixed bounded type sizes rather than viewport-width type: approximately `26-30px` for the question, `16-18px` for answers, and `14px` for metadata.

Falsifiable viewport check: at `960 x 480`, a three-line question and two-line answer labels must show all four answer controls and the score with no page-level horizontal scroll.

### 2. Make touch interaction dependable

- Give every answer and primary action a stable, generous touch target appropriate for an Echo Show.
- Make the entire answer button readable at a glance, including long labels.
- Preserve a visible disabled state while an answer is being submitted.
- Show feedback in a dedicated status region with color and text, never color alone.
- Avoid controls that depend on hover, pointer precision, or a keyboard-only affordance.
- Ensure focus indicators remain visible for keyboard and accessibility tooling.

Implementation detail:

- Add `_submitting` state and set it synchronously on the first answer tap. While set, render answer buttons disabled and mark the answer region busy.
- On rejected `submit_answer`, clear `_submitting`, show a short retryable error status, and preserve the current answers.
- Clear an existing `_feedbackTimer` before scheduling the next question and clear it in `disconnectedCallback()`.
- Guard the delayed next-question action so it cannot advance a newer question after Home Assistant has re-rendered the card.
- Add a visually stable `A` through `D` marker to each answer. It helps fast scanning and spoken reference; the full label remains the accessible answer name.
- Apply a brief horizontal shake to the question region for an incorrect answer. It supplements persistent red icon and text feedback rather than being the only failure signal.

Falsifiable interaction check: two rapid taps on one answer must create one `submit_answer` call and no duplicate `next_question` call.

### 3. Design each card state

- **Empty/configuration:** concise explanation that an OpenTDB quiz entity is required; avoid an oversized blank panel.
- **Idle:** strong quiz title, brief current setup context if available, and one clear Start quiz action.
- **Question:** question, progress, answer grid, feedback, and score in a predictable order.
- **Submitting/feedback:** prevent duplicate submissions, retain the question, and show the result until the next question is available.
- **Complete:** percentage and elapsed time as the primary result, answered/correct count as supporting detail, and a clear New quiz action.
- **Missing related entities or malformed attributes:** render a useful fallback state instead of blank text or broken controls.

Implementation detail:

- Model the render result as explicit states: `unconfigured`, `unavailable`, `idle`, `question`, `feedback`, and `complete`.
- Render every state inside the same styled `<ha-card>` shell.
- Display progress only when an active question has a positive total, using wording such as `Question 3 of 10`.
- In feedback, retain the submitted answer's selected appearance. Mark a correct submitted answer with a green icon and `Correct`; mark an incorrect submitted answer with a red icon and `Incorrect`, then reveal the correct answer with a green icon and distinct correct-answer styling.
- In complete, make the percentage primary and keep correct count plus elapsed time as supporting metadata.

### 4. Make the card naming hierarchy clear

- Show both the configured card name and the quiz name in the card header, with distinct hierarchy so neither is mistaken for an entity ID.
- Keep entity IDs out of the main visual hierarchy; they are configuration details, not presentation content.
- Keep the naming treatment compact enough that long quiz names do not displace progress or controls.

Implementation detail:

- Render the configured card title when it exists; otherwise show the fixed card name `Open Trivia DB Quiz`.
- Render the quiz name as the primary heading.
- Apply `min-width: 0` to the title block and a two-line clamp to the quiz name. Progress remains fixed-width, unwrapped, and right-aligned.

### 5. Theme and accessibility checks

- Respect Home Assistant theme variables where available and provide sensible fallbacks.
- Verify contrast for normal text, muted metadata, buttons, feedback, and disabled controls.
- Use semantic headings, button labels, and a live status region for feedback.
- Do not rely on color or iconography alone to communicate correctness.
- Check text scaling and long translations without clipping or overlapping controls.

Implementation detail:

- Escape all card, quiz, question, and answer strings before interpolating them into a template. Escape `&`, `<`, `>`, `"`, and `'`.
- Use `aria-live="polite"` for feedback and service errors.
- Set `aria-pressed="true"` on the submitted answer while feedback is visible and include an explicit label for the revealed correct answer.
- Include the choice marker and answer text in each answer button's `aria-label`.
- Add `@media (prefers-reduced-motion: reduce)` to disable the incorrect-answer shake and any other feedback transition.
- Keep radii at `8px` or less for this compact Lovelace control surface.

Falsifiable content check: an answer containing `<b>Not markup</b> & "quoted"` must display literally as one button, not generate nested markup.

## Implementation Order

1. Add typed state and text helpers in `OpenTdbCard`: related-state lookup, display-name selection, view-state selection, and HTML escaping. Keep this as a small local refactor; it must not change the card configuration API.
2. Add submission lifecycle state, service-error handling, feedback timer cancellation, and disconnect cleanup. Validate one answer submission and failed-service retry behavior before styling further.
3. Restructure the active template into separate header, question region, question copy, answer-grid, feedback, and score regions. Add choice markers and semantic attributes as part of this pass.
4. Apply the Echo Show height budget and refine CSS variables, text clamping, answer states, focus treatment, feedback colors, and reduced-motion behavior.
5. Give idle, complete, unconfigured, unavailable, and incomplete-data cases the same styled card shell. Do not show inactive progress or synthetic values such as `1 / 0`.
6. Run manual Home Assistant validation at `960 x 480`, `390 x 844`, and `1024 x 768` using short and long quiz data. Confirm no horizontal overflow, visible answers at the Echo Show target, feedback behavior, and single-answer submission.
7. Run `npm run build` after source changes and verify the generated root [opentdb-card.js](../opentdb-card.js) is synchronized before release.

## Acceptance Criteria

- At 960 x 480, the active question state keeps the question, all answer controls, and score visible without page-level horizontal scrolling.
- The answer grid remains stable when labels wrap, and every answer remains easy to tap.
- Long question and answer text wraps cleanly without overlapping the progress, feedback, or footer.
- Idle, active, feedback, complete, and missing-entity states are visually distinct and usable.
- The card remains legible in light and dark Home Assistant themes and at increased text size.
- The source and compiled artifact stay synchronized through the existing build process.
- The changes are validated at the target Echo Show viewport and at least one narrow viewport.

## Definition Of Done

- The source uses no unescaped quiz-controlled value inside `innerHTML`.
- The card reports a service failure in its own UI and recovers without requiring a page reload.
- Feedback timers are cleaned up on rerender and disconnection.
- Card title, quiz name, and progress are separately styled and do not overlap at any target viewport.
- The Echo Show layout keeps actionable answers visible in ordinary use; exceptional content scrolls within the whole question region.
- An incorrect answer displays red icon/text feedback, reveals the correct answer in green, and plays a brief shake when reduced motion is not requested.
- Manual Home Assistant validation confirms single-answer submission and escaped text rendering.
- `npm run build` succeeds and updates the HACS root artifact.

## Questions Before Implementation

The initial design decisions are settled:

- The fallback card name is `Open Trivia DB Quiz`.
- Answer choice markers are shown for both multiple-choice and true/false questions.
- Exceptionally long content expands and scrolls in the whole question region.
- Incorrect answers reveal the correct answer and show red/green icon and text feedback, with a short incorrect-answer shake.
- Validation is manual in Home Assistant; do not add a browser fixture or test harness.

No card code will be changed until these decisions are approved or answered.
