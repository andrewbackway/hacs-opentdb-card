# OpenTDB Integration and Card Contract

The card uses a selected OpenTDB quiz entity as its `quiz_id` and an
authenticated Home Assistant WebSocket session. It does not read the selected
sensor or shared entity attributes for runtime quiz state.

## Session Commands

Every request includes `quiz_id`. Home Assistant identifies the caller from
the WebSocket connection; the card does not send a user name or user ID.

### `opentdb/session/start`

Starts or resumes the calling user's quiz session.

### `opentdb/session/new`

Starts a new quiz session for the calling user using a newly fetched question
set.

### `opentdb/session/submit`

Accepts `session_id`, `question_index`, and `answer`. The response contains
server-authoritative feedback and updated session state.

### `opentdb/session/next`

Advances the calling user's session after feedback and returns the next
spoiler-safe question.

## Session Response

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
  "feedback": null,
  "score": { "answered": 2, "correct": 2, "incorrect": 0, "points": 340, "streak": 2 },
  "elapsed_seconds": 42,
  "complete": false,
  "leaderboard": []
}
```

`question` never contains `correct_answer`. That value may appear only in
`feedback` after a successful submission. Sessions, question indexes, and
submissions are validated against the authenticated caller. Duplicate submits
for the same session and question must be idempotent.

## State Ownership

- The card owns the active `QuizSession` in JavaScript instance state.
- The integration owns session validity, question ordering, scoring, timing,
  and leaderboard calculation.
- No quiz sensor, `attributes.game`, `entity_id` service target, or shared
  entity state is part of the runtime contract.

## Breaking Change

The quiz sensor, its `attributes.game` payload, sensor entity picker, and the
legacy entity-targeted quiz services are removed. Card configuration must use
`quiz_id`. The card and integration must be released together.

## Verification

1. Two authenticated users play the same quiz simultaneously with different
   answers and see independent question, feedback, score, and completion state.
2. A dashboard reload resumes only the caller's session.
3. One user's submission does not repaint another user's open card.
4. Stale indexes, duplicate submissions, expired sessions, unauthorized quiz
   IDs, disconnects, and daily set rollover are covered by tests.
