import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { fontsLoaded } from "./helpers";
import { cspGuard, violations } from "./csp-guard";

// The AI client (wow plan, job 13): "Test key" in AI settings sends one tiny request to Anthropic with the
// person's own key. Anthropic is never reached here: every request to it is answered by a stand-in.
// The page's Content Security Policy is watched, so a request the policy refuses fails the test.

const KEY = "sk-ant-api03-SECRET-abcd1234";
const dialog = (page: Page) => page.getByRole("dialog", { name: "AI settings" });
const testButton = (page: Page) => dialog(page).getByRole("button", { name: "Test key" });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST",
};
/** Answers Anthropic's API with `status` and `body`, and the browser's CORS check before it. */
async function anthropic(page: Page, status: number, body: unknown) {
  const posts: Request[] = [];
  await page.route("https://api.anthropic.com/**", (r: Route) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    posts.push(r.request());
    return r.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
  return posts;
}
const works = { type: "message", stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }] };

/** Every request the page makes, with its headers and body. */
function watchAll(page: Page) {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  page.on("request", (r) => seen.push({ url: r.url(), headers: r.headers(), body: r.postData() ?? "" }));
  return seen;
}

async function saveKey(page: Page) {
  await page.locator("header.toolbar").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "AI settings", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(testButton(page)).toBeDisabled();
  await dialog(page).getByLabel("Anthropic API key").fill(KEY);
  await dialog(page).getByRole("button", { name: "Save key" }).click();
  await expect(dialog(page).getByText("sk-ant-…1234")).toBeVisible();
}

test.describe("Test key", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    (page as Page & { errors: string[] }).errors = errors;
    await cspGuard(page);
    await page.goto("/");
    await fontsLoaded(page);
  });
  test.afterEach(async ({ page }) => {
    expect((page as Page & { errors: string[] }).errors).toEqual([]);
    expect(await violations(page)).toEqual([]);
  });

  test("says the key works, counts one use, and sends the key only to api.anthropic.com in its own header", async ({ page }) => {
    const seen = watchAll(page);
    const posts = await anthropic(page, 200, works);
    await saveKey(page);
    await expect(dialog(page).getByText("0 of 200 used this month")).toBeVisible();
    await testButton(page).click();
    await expect(dialog(page).getByText("Key works.")).toBeVisible();
    await expect(dialog(page).getByText("1 of 200 used this month")).toBeVisible();

    expect(posts).toHaveLength(1);
    const h = posts[0].headers();
    expect(posts[0].url()).toBe("https://api.anthropic.com/v1/messages");
    expect(h["x-api-key"]).toBe(KEY);
    expect(h["anthropic-version"]).toBe("2026-10-21");
    expect(h["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(posts[0].postData()!);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(JSON.stringify(body)).not.toContain("SECRET");

    // Anywhere else the key turns up (another address, a body, another header) fails the test.
    const leaks = seen.flatMap(({ url, headers, body }) => {
      const out: string[] = [];
      if (url.includes("SECRET") || body.includes("SECRET")) out.push(url);
      for (const [name, value] of Object.entries(headers))
        if (value.includes("SECRET") && !(name === "x-api-key" && url === "https://api.anthropic.com/v1/messages"))
          out.push(`${url} ${name}`);
      return out;
    });
    expect(leaks).toEqual([]);
    expect(await dialog(page).innerText()).not.toContain("SECRET");
  });

  test("a key Anthropic turns down gets a plain message", async ({ page }) => {
    await anthropic(page, 401, {
      type: "error",
      error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` },
    });
    await saveKey(page);
    await testButton(page).click();
    const alert = dialog(page).getByRole("alert");
    await expect(alert).toContainText("isn't valid");
    expect(await alert.innerText()).not.toContain("SECRET");
    await expect(dialog(page).getByText("1 of 200 used this month")).toBeVisible();
  });

  test("an organization that blocks browser use gets its own message", async ({ page }) => {
    await anthropic(page, 401, {
      type: "error",
      error: { type: "authentication_error", message: "CORS requests are not allowed for this Organization because of its settings." },
    });
    await saveKey(page);
    await testButton(page).click();
    await expect(dialog(page).getByRole("alert")).toContainText("Zero Data Retention or Compliance API");
  });

  test("a test still running when the key is forgotten is stopped, so its answer can't show afterwards", async ({ page }) => {
    let answer: () => void = () => {};
    const held = new Promise<void>((r) => (answer = r));
    await page.route("https://api.anthropic.com/**", async (r: Route) => {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      await held;
      return r
        .fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(works) })
        .catch(() => {});
    });
    await saveKey(page);
    await testButton(page).click();
    await expect(dialog(page).getByText("Testing…")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Forget key" }).click();
    await expect(dialog(page).getByText("Key forgotten.")).toBeVisible();
    answer();
    // Give a late answer time to arrive; the note must stay.
    await page.waitForTimeout(300);
    await expect(dialog(page).getByText("Key forgotten.")).toBeVisible();
    await expect(dialog(page).getByText("Key works.")).toHaveCount(0);
  });

  test("once this month's limit is reached, nothing is sent", async ({ page }) => {
    const posts = await anthropic(page, 200, works);
    await saveKey(page);
    const cap = dialog(page).getByLabel("Stop after this many uses a month");
    await cap.fill("1");
    await cap.press("Enter");
    await testButton(page).click();
    await expect(dialog(page).getByText("Key works.")).toBeVisible();
    await testButton(page).click();
    await expect(dialog(page).getByRole("alert")).toContainText("this month");
    await expect(dialog(page).getByText("1 of 1 used this month")).toBeVisible();
    expect(posts).toHaveLength(1);
  });
});
