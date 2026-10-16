// The FAQ, Terms and Privacy pages fold each section (<details>). A link to one section (faq/#import)
// opens it, on arrival and when the address changes while on the page.
function openLinked() {
  let id = location.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // a broken % code in the link: look it up as typed
  }
  const fold = id ? document.getElementById(id)?.closest('details') : null;
  if (fold) fold.open = true;
}
openLinked();
addEventListener('hashchange', openLinked);
