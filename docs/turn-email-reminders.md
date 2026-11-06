# Turn email reminders

Async games send up to two reminders while the current player still needs to finish their turn. These use the existing email notification preference.

- Morning: 9 a.m. on expiry day, or 9 a.m. the previous day for deadlines before noon.
- Final: two hours before expiry, moved earlier to 8 p.m. the previous evening if outside 8 a.m.–8 p.m.
- When the two reminders are less than four hours apart, keep only the final reminder.
- Skip reminders less than four hours after the turn starts, or whose scheduled time has already passed.
- Finishing the turn or ending the game cancels pending jobs. Actions within the same turn preserve them. Send-time checks reject stale turns and expired deadlines.

Account settings save the browser's system timezone once, without IP or location lookup. Users can override it. America/Denver is the fallback for accounts without a saved timezone. Saving a timezone or email preference recalculates pending reminders for that user's current turns, skipping reminders already dispatched. Existing turns acquire reminders when their player saves their initial timezone; new turns schedule them automatically.

Emails use a simple white layout, explicit foreground/background colors, and light-only color-scheme declarations. Some email clients can forcibly recolor messages regardless of sender declarations; client behavior cannot be fully controlled by email HTML.
