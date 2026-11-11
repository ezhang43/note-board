## Content Security Policy on every page (2026-11-11)

- Every page of the site (the app, About, FAQ, Terms, Privacy and Delete your account) now tells the browser which sites it may load scripts and frames from and send requests to. A script slipped into a page can no longer load more code from elsewhere or send your boards (or, later, your own Anthropic key) to a site of its own with a request.
- Allowed: the site itself, Google sign-in and Firebase sync, Google Calendar, Google Fonts, the Anthropic API, the YouTube and Vimeo players, and the visit counter. Pictures and videos on link cards still come from any secure (https) site.
- Download as picture / PDF: a picture from a site that allows copying is now loaded again as a picture and copied in, instead of being fetched, so it still shows in the download. Pictures from sites that don't allow it are a blank panel, as before, and a picture site that never answers no longer holds up the download (it is left blank after 8 seconds).
- Nothing you see changes, and saved boards are untouched. New browser tests fail if any page breaks the policy.
