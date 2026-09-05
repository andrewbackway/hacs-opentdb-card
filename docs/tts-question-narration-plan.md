# Home Assistant TTS Question Narration Plan

## Goal

Add an optional card feature that reads each active quiz question and its
potential answers through a Home Assistant TTS provider and configured media
player. Selecting an answer must immediately halt playback before the answer
submission proceeds.

This is a card-only change. It uses Home Assistant service calls; it does not
require changes to the OpenTDB integration session protocol.

## Confirmed Product Decisions

- TTS starts for every newly displayed active question.
- The spoken message includes answer labels and text, for example, `A. Paris`.
- When narration is enabled but either TTS engine or media player is missing,
  the card stays playable and does not speak or display an error.
- The configuration editor shows the engine and media-player fields only when
  **Read out question** is enabled.

## Configuration Contract

Add these optional card configuration fields:

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `read_out_question` | Boolean | `false` | Enable question and answer narration. |
| `tts_engine` | TTS entity ID | None | The Home Assistant TTS provider to invoke. |
| `media_player` | Media player entity ID | None | The device that plays the generated speech. |

Recommended dashboard configuration:

```yaml
type: custom:opentdb-card
quiz_id: family_trivia
title: Evening trivia
read_out_question: true
tts_engine: tts.home_assistant_cloud
media_player: media_player.kitchen_speaker
```

The implementation should use the current Home Assistant `tts.speak` service
form. The TTS engine is the service target and the player is passed in service
data:

```yaml
action: tts.speak
target:
  entity_id: tts.home_assistant_cloud
data:
  media_player_entity_id: media_player.kitchen_speaker
  message: "Question: What is the capital of France? Answers: A. Paris. B. Rome. C. Berlin. D. Madrid."
```

When a player answers while speech may be playing, use this service call before
submitting the answer:

```yaml
action: media_player.media_stop
target:
  entity_id: media_player.kitchen_speaker
```

## Implementation Steps

1. Extend `QuizConfig` with the three optional TTS fields and extend the local
   Home Assistant type with `callService`, preserving the existing typed
   `callWS` session API.
2. Add editor schema entries for **Read out question**, **TTS engine**, and
   **Media player**. Use a boolean selector for the toggle and entity selectors
   filtered to the `tts` and `media_player` domains. Build the schema so the
   two entity selectors appear only when the toggle is true.
3. Add small private state to `OpenTdbCard` that identifies the question index
   most recently sent to TTS. Reset this state when the session is restarted,
   replaced because its set changes, or the card disconnects. This prevents
   incidental renders from replaying the same question.
4. Add a helper that is eligible to narrate only when all conditions hold:
   `read_out_question` is true, both entity IDs are nonempty strings, the card
   has an active non-feedback question, the question index is valid, and that
   index has not already been narrated.
5. Construct a plain-text speech message from the in-memory question and
   answer strings. Use `Question: <question>. Answers: A. <answer>. B.
   <answer>.` ordering, derive labels from the displayed answer positions, and
   avoid interpolating escaped HTML or rendered markup. Send it through
   `hass.callService("tts", "speak", serviceData, target)` using the documented
   `media_player_entity_id` data field and TTS entity target.
6. Treat narration as best-effort. Catch or ignore service-call failures so
   unavailable providers, players, or browser connection interruptions never
   block rendering, answer submission, feedback, or advancement.
7. In the answer-button handler, call `media_player.media_stop` for the
   configured player immediately after validating the chosen answer and before
   setting submission state or issuing `opentdb/session/submit`. Do this only
   when TTS is enabled and a valid player is configured; do not wait for the
   stop call before submitting.
8. Keep TTS distinct from the existing WebAudio feedback sounds. Turning off
   `sound` must not disable speech narration, and enabling narration must not
   alter chime, buzzer, fanfare, reduced-motion, or quiz session behavior.
9. Update the README configuration table and example with the new options,
   including the recommended `tts.speak` syntax and the statement that an
   answer stops the configured player.
10. Build the distribution with `npm run build` so root-level
    `opentdb-card.js` reflects the TypeScript source change.

## Verification

1. Configure a valid provider and player, start a quiz, and verify one spoken
   message contains the question followed by every displayed labeled answer.
2. Force harmless rerenders for the same active question, such as Home
   Assistant state updates, and verify it is not read a second time.
3. Advance through questions, including after incorrect and correct feedback,
   and verify each new question is narrated exactly once.
4. Select an answer while the media player is speaking. Verify the player is
   stopped before or as the answer feedback begins, and the WebSocket answer
   submission still succeeds.
5. Enable narration with either `tts_engine` or `media_player` omitted,
   unavailable, or invalid. Verify the card remains playable, provides no
   narration, and shows no new service error.
6. Verify `sound: false` suppresses only WebAudio effects while configured TTS
   narration still plays.
7. Toggle **Read out question** in the visual editor and verify the engine and
   player selectors appear only when enabled and preserve their selected
   values when it is disabled and re-enabled.
8. Run `npm run build`, reload the Home Assistant resource without cache, and
   repeat the configured-player smoke test from a dashboard.

## Acceptance Criteria

- TTS is opt-in and defaults to disabled.
- The editor conditionally exposes TTS engine and media-player configuration.
- Each active question is spoken once with lettered potential answers.
- Answer selection asks Home Assistant to stop the configured media player
  before sending the quiz answer.
- Missing or failed TTS configuration has no effect on normal quiz play.
- Existing sound effects and authenticated quiz session behavior remain
  unchanged.