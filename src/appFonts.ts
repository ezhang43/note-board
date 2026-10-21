// index.html asks only for what the sign-in screen shows: IBM Plex Sans 400, 500 and 600 (job 165a).
// The rest of the board's typefaces (the Plex Sans italics, and the Mono, Serif, Rounded and Handwritten text styles)
// come with the board, so someone who only signs in never downloads them.
const FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@1,400;1,600&family=IBM+Plex+Mono:ital,wght@0,400;0,600;1,400;1,600&family=Lora:ital,wght@0,400;0,600;1,400;1,600&family=Nunito:ital,wght@0,400;0,700;1,400;1,700&family=Caveat:wght@400;700&display=swap';

if (!document.querySelector(`link[href="${FONTS}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS;
  document.head.append(link);
}
