# OpenTDB Integration Handover

## Confirmed Bug

The OpenTDB integration's service handlers fail with `'coroutine' object is not iterable` when the card calls `opentdb.start_quiz` (and likely the other targeted services).

Repository: `C:\git\hacs-opentdb`

File: `custom_components/opentdb/__init__.py`

In `get_coordinators`, the integration currently assigns the coroutine returned by `async_extract_config_entry_ids` directly:

```python
ids = async_extract_config_entry_ids(hass, call)
```

It then iterates over `ids`. Await the helper:

```python
ids = await async_extract_config_entry_ids(hass, call)
```

The function is already async, and its callers already await `get_coordinators`, so this is a focused fix.

## Recommended Verification

1. Add or update an integration service test that calls `opentdb.start_quiz` with a valid OpenTDB device target and an authenticated Home Assistant user.
2. Verify `opentdb.new_quiz`, `submit_answer`, `next_question`, `reset_quiz`, and `refresh` do not produce the same coroutine error.
3. Confirm service calls target the OpenTDB device associated with the selected quiz sensor.
4. Confirm repeated config entries with the same quiz name receive unique Home Assistant entity IDs without changing the fixed sensor suffixes.

The card repository has switched to the canonical `opentdb.start_quiz` service and limits its entity selector to OpenTDB sensors, but it cannot repair this integration-side coroutine bug.