# Client-Side Quiz State Plan

## Problem

The card currently renders `state` and every field in `attributes.game` from one
configured quiz sensor. Although service calls include the authenticated Home
Assistant user context, the sensor is shared by every dashboard viewer. An
update caused by one player can therefore render that player's question,
feedback, score, or completion state in another player's card.

The browser card must own the active quiz session and current question. The
integration remains authoritative for the daily question set, answer scoring,
and leaderboard, but must not publish a runtime quiz sensor or any
player-specific progress in shared entity state.

## Target Architecture

- The card opens a player session through a user-authenticated integration API.
   The response supplies that user's current question, progress snapshot, and
   shared quiz metadata.
- The card stores the session ID, question index, question payload, selected
  answer, feedback, score, and completion state in JavaScript instance fields.
- A submitted answer is sent with the card's session ID and locally held
  question index. The response supplies feedback and either the next question
  or a completed result.
- The card does not read a quiz sensor for runtime data.

This keeps state isolated per browser card instance. Reloading the dashboard
starts or resumes the caller's server-side session through the authenticated
API; it never adopts a different player's shared-entity snapshot.

## Proposed Integration Contract

Add a WebSocket command family or equivalent request/response interface.
WebSocket is preferred because service calls acknowledge completion but do not
return a payload to Lovelace cards.

### `opentdb/session/start`

Request:

```json
{ "quiz_id": "configured-quiz-id" }
```

Response:

```jsonc
{
  "session_id": "opaque-per-user-session-id",
  "set_id": "a1b2c3d4",
  "quiz_name": "Family Trivia",
  "question_index": 2,
  "total_questions": 10,
  "question": {
    "category": "Science & Nature",
    "type": "multiple",
    "difficulty": "medium",
    "question": "What is ...?",
    "answers": ["A", "B", "C", "D"]
  },
  "score": { "answered": 2, "correct": 2, "incorrect": 0, "points": 340, "streak": 2 },
  "elapsed_seconds": 42,
  "complete": false
}
```

The integration identifies the caller from the Home Assistant connection; the
card must not send a user name or user ID. The response never contains a
correct answer until a successful submission response.

### `opentdb/session/submit`

Request:

```json
{
   "quiz_id": "configured-quiz-id",
  "session_id": "opaque-per-user-session-id",
  "question_index": 2,
  "answer": "B"
}
```

Response includes server-authoritative `feedback`, updated `score`, and either
the next spoiler-safe question or `complete: true` with the completed result.
The integration rejects an expired session, a session belonging to another
user, and a stale question index with structured errors. It must make a repeat
submission for the same session/question idempotent.

### Quiz configuration

Replace the card's required `entity` configuration with a stable integration
quiz identifier, for example:

```yaml
type: custom:opentdb-card
quiz_id: family_trivia
title: Evening trivia
```

The integration validates that the calling user may access `quiz_id`. It returns
availability, quiz name, set ID, question count, and leaderboard as part of the
session response. The quiz sensor and its `attributes.game` contract are
removed rather than retained in a reduced form.

## Card Implementation Steps

1. Replace the current `entity` card configuration and `getQuizState()` /
   `getGame()` render dependencies in `OpenTdbCard` with a required `quiz_id`
   and a typed local `QuizSession` field.
2. Extend the local Home Assistant type with the supported WebSocket request
   method. On card connection/configuration, call `session/start`; show a
   loading state while awaiting it and render unavailable/error states when it
   fails.
3. Render the question, progress, footer score, feedback, completion view, and
   shared metadata solely from `QuizSession`. A new request response is the
   only source that may replace local quiz state.
4. On answer selection, lock the locally displayed question, submit its local
   session ID/index/answer, and replace local state only with the matching
   response. Clear the existing feedback timer before replacing session state.
5. Preserve the short feedback delay locally. After it elapses, request the
   next session state or use the next-question payload returned by submit;
   never call a fire-and-forget service and wait for the sensor to advance.
6. When any session response reports a changed set ID, discard local session
   state and call `session/start` again. On card disconnect, clear timers and
   ignore late request responses.
7. Update the README and integration handover contract so configuration no
   longer claims all quiz data comes from `attributes.game`.

## Migration Order

1. Implement and test the session API and `quiz_id` lookup in the integration.
2. Update the card to require the matching integration version and use the
   session API exclusively.
3. Remove the quiz sensor, `attributes.game` payload, legacy services that
   depend on `entity_id`, and the card's sensor entity picker in the same
   coordinated release.
4. Document the breaking configuration change and required integration/card
   versions in the release notes.

## Verification

1. Open the same configured card simultaneously as two distinct Home Assistant
   users. Start both quizzes, submit different answers, and confirm that each
   card keeps its own question index, selection, feedback, score, and completion
   state while the shared leaderboard updates for both.
2. Reload one user's dashboard during a question and confirm `session/start`
   resumes only that user's progress.
3. Submit from one user while the other card is visible; confirm the other card
   does not re-render its active question or feedback until its own session
   request returns.
4. Exercise stale index, duplicate submission, expired session, session-owner
   mismatch, disconnected card, and daily set rollover responses.
5. Run `npm run build` for the card and the integration's existing test suite
   after the corresponding implementation changes.

## Acceptance Criteria

- A question displayed by a card belongs only to that card's authenticated
  session, not to the latest shared sensor update.
- No quiz sensor or shared entity state is used for the quiz runtime.
- The integration remains server-authoritative for answers, scores, sessions,
  and shared leaderboard data.
- Another user's play can update shared leaderboard metadata without changing
  the current question, feedback, score, or completion screen in an open card.
