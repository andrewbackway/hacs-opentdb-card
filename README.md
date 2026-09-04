# OpenTDB Card

A standalone Lovelace card for the [Open Trivia Database Home Assistant integration](https://github.com/andrewbackway/hacs-opentdb).

## Installation

[![Open your Home Assistant instance and show the add repository dialog](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=andrewbackway&repository=hacs-opentdb-card&category=dashboard)
[![Install OpenTDB Card with HACS](https://img.shields.io/badge/HACS-Install-41BDF5?logo=homeassistant&logoColor=white)](https://github.com/andrewbackway/hacs-opentdb-card)

Add `https://github.com/andrewbackway/hacs-opentdb-card` as a custom HACS repository with the category **Dashboard**. Install **Open Trivia Database Card**, then reload your browser.

The card expects the integration to be installed and configured first. Add it to a dashboard as a Manual card:

```yaml
type: custom:opentdb-card
entity: sensor.trivia_quiz_quiz
title: Evening trivia
```

### Configuration

| Option | Required | Description | Default |
| --- | --- | --- | --- |
| `type` | Yes | Must be `custom:opentdb-card`. | None |
| `entity` | Yes | The quiz sensor provided by the Open Trivia Database integration. In the visual editor, only sensors from the `opentdb` integration are offered. The card normally expects this entity ID to end in `_quiz`, then derives the related `_question`, `_score`, and `_elapsed_time` entities. | None |
| `title` | No | Heading shown at the top of the card. | The quiz sensor's `friendly_name`, then its `quiz_name`, then `Trivia Quiz` |

The related entities are managed by the OpenTDB integration and are not configured separately in the card. If Home Assistant has added a suffix such as `_2` to an entity ID, select the actual quiz sensor belonging to the quiz instance you want to use; do not manually change the derived suffixes.

The card starts a quiz using the integration's `opentdb.start_quiz` service and submits answers as the logged-in Home Assistant user. The OpenTDB integration must be installed, loaded, and up to date for these actions to work.

The card displays the current question and shuffled answers, submits answers for the logged-in Home Assistant user, shows feedback, advances after a short delay, and displays the final percentage and elapsed time.

## Development

```powershell
npm ci
npm run build
```

The compiled card is written to `opentdb-card.js`, which is the root-level file HACS expects from `hacs.json`.
