# OpenTDB Integration ↔ Card Contract (v0.2.0)

> The previous "confirmed bug" (missing `await` on `async_extract_config_entry_ids`)
> **no longer applies** — the integration already awaits it. This document now describes
> the live data/service contract between the integration and the card.

## Single-entity contract

The card is configured with **one** entity: the quiz sensor `sensor.<name>_quiz`.
It reads **only** `state` + `attributes.game`. It no longer derives sibling entities by
string-replacing the `_quiz` suffix.

### `state`

One of: `idle` | `question` | `feedback` | `complete`.

### `attributes.game`

```jsonc
{
  "quiz_name": "Family Trivia",
  "set_id": "a1b2c3d4",
  "day": "2026-09-04",
  "question_index": 2,            // 0-based
  "total_questions": 10,
  "question": {                   // null when idle/complete; NEVER contains correct_answer
    "category": "Science & Nature",
    "type": "multiple",
    "difficulty": "medium",
    "question": "What is ...?",
    "answers": ["A", "B", "C", "D"]   // shuffled once at fetch; render in this order
  },
  "feedback": {                   // present ONLY in the `feedback` state (post-submit)
    "correct": true,
    "answer": "B",                // the player's submitted answer
    "correct_answer": "B",        // revealed only after submitting
    "awarded_points": 175,
    "speed_bonus": 50,
    "streak_bonus": 25
  },
  "score": {
    "answered": 3, "correct": 2, "incorrect": 1,
    "percentage": 66.7, "points": 340, "streak": 0, "best_streak": 3
  },
  "elapsed_seconds": 42,
  "player": { "name": "Alice", "total_points": 12040, "daily_play_streak": 5 },
  "leaderboard": [
    { "name": "Alice", "points_today": 340, "points_total": 12040, "accuracy": 81.2, "best_streak": 6 },
    { "name": "Bob",   "points_today": 210, "points_total":  9800, "accuracy": 74.0, "best_streak": 4 }
  ]
}
```

**Spoiler rule:** `correct_answer` is withheld from `question` and only appears inside
`feedback` after the player submits. Do not reveal the answer before `feedback` exists.

## Services (called by the card)

All target the OpenTDB device via the configured `entity_id`; each user-scoped service
requires an authenticated Home Assistant user context.

| Service | Purpose |
|---|---|
| `opentdb.start_quiz` | Start/resume the current shared set for the calling user (bootstraps a set if none exists). |
| `opentdb.new_quiz` | Force-fetch a brand-new shared set, then start it. |
| `opentdb.submit_answer` | Submit one answer (`question_index`, `answer`). Server scores it. |
| `opentdb.next_question` | Advance after feedback. |
| `opentdb.reset_quiz` | Reset the calling user's progress. |
| `opentdb.refresh` | Re-publish state without fetching. |

`opentdb.refresh_questions` remains as a deprecated alias of `new_quiz`.

## Scoring (server-authoritative)

- Correct answer: `100` base points.
- Speed bonus: up to `+100`, decaying linearly to `0` across a 15s window from when the
  question was presented (`presented_at`).
- Streak bonus: `+25` per consecutive correct answer, capped at 5 (max `+125`). A wrong
  answer resets the streak.
- Daily play streak: consecutive days the user has answered at least one question.

## Daily set behaviour

- A shared question set is fetched once per day at the configured refresh time (and on
  first setup if the cache is empty). All players answer the same set.
- `start_quiz` reuses the existing set and resets only the calling player; `new_quiz`
  force-fetches a replacement set.

## Card behaviour notes

- Answer buttons disable immediately on tap (before the service round-trip).
- The `next_question` timer is cleared on disconnect and guarded against firing while
  unmounted.
- Sound effects are synthesised via WebAudio (no bundled assets); wrong answers buzz +
  shake, correct answers chime + pop, quiz completion plays a short fanfare. All motion
  respects `prefers-reduced-motion`, and both sound and shake are toggleable in the card
  editor.

## Verification checklist

1. `opentdb.start_quiz` / `submit_answer` / `next_question` succeed for an authenticated
   user targeting the quiz device.
2. `question.answers` renders; `correct_answer` is absent until `feedback`.
3. Points/streak/leaderboard update across players on the shared daily set.
4. Duplicate quiz names still get unique entity IDs with stable sensor suffixes.