## AI client: Note Board can now talk to Claude with your own key (2026-11-12)

- New "Test key" button in AI settings (beside Forget key). It sends one tiny request to Anthropic with your saved key, counts as one of this month's uses, and says "Key works." or what went wrong in plain words: a key that isn't valid, an Anthropic organization that blocks browser use (Zero Data Retention or Compliance API), a spend or rate limit, Anthropic being busy, no connection, and so on.
- Behind it is the one piece every AI feature will use to ask Claude: it sends only what the feature chose, straight from your browser to Anthropic, never through BusyAnts. It checks Claude's answer before anything uses it, sends nothing once the monthly limit is reached, and never writes your key anywhere it could leak.
- The site's security policy now lets pages reach Anthropic's API (`https://api.anthropic.com` only), as the owner agreed on 2026-11-12.
- The Privacy page says what an AI button sends, to whom, and with whose key. The AI settings hint says the same.
- No AI feature on the board uses it yet; those come next. Saved boards are unchanged.
