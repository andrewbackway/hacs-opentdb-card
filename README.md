# OpenTDB Card

A standalone Lovelace card for the [Open Trivia Database Home Assistant integration](https://github.com/andrewbackway/hacs-opentdb).

## Installation

Add `https://github.com/andrewbackway/hacs-opentdb-card` as a custom HACS repository with the category **Dashboard**. Install **Open Trivia Database Card**, then reload your browser.

The card expects the integration to be installed and configured first. Add it to a dashboard as a Manual card:

```yaml
type: custom:opentdb-card
entity: sensor.trivia_quiz_quiz
title: Evening trivia
```

The `entity` must be the quiz sensor, normally ending in `_quiz`. The card derives the question, score, and elapsed-time entities from that ID. `title` is optional and defaults to the configured quiz name.

The card displays the current question and shuffled answers, submits answers for the logged-in Home Assistant user, shows feedback, advances after a short delay, and displays the final percentage and elapsed time.

## Development

```powershell
npm ci
npm run build
```

The compiled card is written to `opentdb-card.js`, which is the root-level file HACS expects from `hacs.json`.
