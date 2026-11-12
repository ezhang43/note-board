## AI client: Test key follow-ups (2026-11-12)

- Test key no longer says "Key works." when Anthropic's reply breaks on the way (cut off or unreadable). It now says it couldn't reach Anthropic, like any lost connection.
- A running Test key is now stopped, and says nothing, when something changes under it: the model is picked again, the key is forgotten (here or in another tab), a new key is saved, or you sign out or someone else signs in.
- A request that times out now says Anthropic took too long, not "Stopped." (that word is only for when you cancel).
- Clearer messages: a rate limit (too many requests, wait a minute) is no longer mixed with a spend or billing limit, a key that isn't allowed has its own message, and a browser that can't save the use count no longer claims you reached your monthly limit.
- Saved boards are unchanged; the key is still kept only in this browser.
