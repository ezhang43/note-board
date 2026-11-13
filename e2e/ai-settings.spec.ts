import { expect, test, type Page } from "@playwright/test";
import { fontsLoaded, freshBoardEachTest } from "./helpers";

// AI settings (wow plan, job 12a): a dialog in the ⋯ menu where the person keeps their own Anthropic key. The key stays in
// this browser (sessionStorage, or localStorage with "Remember on this device"). Only "Test key" (e2e/ai-client.spec.ts)
// sends a request; nothing here talks to the network.

const KEY = "sk-ant-api03-SECRET-abcd1234";
const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "AI settings" });
const keyBox = (page: Page) => dialog(page).getByLabel("Anthropic API key");

/** Every value this page keeps in either storage. */
const stored = (page: Page) =>
  page.evaluate(() => ({
    session: Object.fromEntries(Object.entries(sessionStorage)),
    device: Object.fromEntries(Object.entries(localStorage)),
  }));

async function openFromMore(page: Page) {
  await page
    .locator("header.toolbar")
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "More" })
    .getByRole("button", { name: "AI settings", exact: true })
    .click();
  await expect(dialog(page)).toBeVisible();
}

test.describe("on a wide desktop", () => {
  freshBoardEachTest();

  test("opens from ⋯, warns plainly, and asks for no network just by opening", async ({
    page,
  }) => {
    const calls: string[] = [];
    page.on("request", (r) => /anthropic/.test(r.url()) && calls.push(r.url()));
    await openFromMore(page);
    const text = (await dialog(page).innerText())
      .replace(/\s+/g, " ")
      .toLowerCase();
    expect(text).toContain("stored in this browser");
    expect(text).toContain("anyone using this browser profile can use it");
    expect(text).toContain("costs money on your anthropic account");
    expect(text).toContain(
      "separate workspace with a low spend limit and a key that expires",
    );
    expect(text).toContain(
      "your key is used only when you press test key or an ai button, or when the visualizer sorts by itself (sort automatically, on until you untick it)",
    );
    expect(text).toContain("straight from this browser to anthropic");
    // Owner, 2026-11-13: only items from your own boards, never from boards shared with you.
    expect(text).toContain(
      "the text of finished checklist items from your own boards, never from boards shared with you",
    );
    await expect(
      dialog(page).getByRole("button", { name: "Test key" }),
    ).toBeDisabled();
    await expect(keyBox(page)).toHaveAttribute("type", "password");
    await expect(keyBox(page)).toHaveAttribute("autocomplete", "off");
    await expect(keyBox(page)).toHaveAttribute("spellcheck", "false");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("a saved key stays in sessionStorage, is never shown again, and Forget key removes it", async ({
    page,
  }) => {
    await openFromMore(page);
    await expect(
      dialog(page).getByRole("button", { name: "Forget key" }),
    ).toBeDisabled();
    await expect(
      dialog(page).getByLabel("Remember on this device"),
    ).not.toBeChecked();
    await keyBox(page).fill(KEY);
    await dialog(page).getByRole("button", { name: "Save key" }).click();

    await expect(dialog(page).getByText("sk-ant-…1234")).toBeVisible();
    await expect(keyBox(page)).toHaveValue("");
    expect(await dialog(page).innerText()).not.toContain("SECRET");
    const where = await stored(page);
    expect(Object.values(where.session)).toContain(KEY);
    expect(Object.values(where.device)).not.toContain(KEY);

    // Still there after a reload of the same tab, still hidden.
    await page.reload();
    await fontsLoaded(page);
    await openFromMore(page);
    await expect(dialog(page).getByText("sk-ant-…1234")).toBeVisible();

    await dialog(page).getByRole("button", { name: "Forget key" }).click();
    await expect(dialog(page).getByText("sk-ant-…1234")).toHaveCount(0);
    const after = await stored(page);
    expect(JSON.stringify(after)).not.toContain("SECRET");
  });

  test('"Remember on this device" moves the key to localStorage, and unticking moves it back', async ({
    page,
  }) => {
    await openFromMore(page);
    await keyBox(page).fill(KEY);
    await dialog(page).getByLabel("Remember on this device").check();
    await keyBox(page).press("Enter");
    await expect(dialog(page).getByText("sk-ant-…1234")).toBeVisible();
    let where = await stored(page);
    expect(Object.values(where.device)).toContain(KEY);
    expect(Object.values(where.session)).not.toContain(KEY);

    await dialog(page).getByLabel("Remember on this device").uncheck();
    where = await stored(page);
    expect(Object.values(where.session)).toContain(KEY);
    expect(Object.values(where.device)).not.toContain(KEY);
  });

  test("the key never appears in the saved board", async ({ page }) => {
    await page
      .locator("header.toolbar")
      .getByRole("button", { name: "Note", exact: true })
      .click();
    await openFromMore(page);
    await keyBox(page).fill(KEY);
    await dialog(page).getByLabel("Remember on this device").check();
    await dialog(page).getByRole("button", { name: "Save key" }).click();
    await expect(dialog(page).getByText("sk-ant-…1234")).toBeVisible();
    await page.waitForTimeout(500);
    const where = await stored(page);
    const holders = Object.entries(where.device)
      .filter(([, v]) => v.includes("SECRET"))
      .map(([k]) => k);
    expect(holders).toHaveLength(1);
    expect(holders[0]).toMatch(/ai/);
  });

  test("the model defaults to Haiku and can be changed; the monthly cap defaults to 200 and can be changed", async ({
    page,
  }) => {
    await openFromMore(page);
    const haiku = dialog(page).getByRole("radio", { name: /Haiku 5\.5/ });
    await expect(haiku).toBeChecked();
    await expect(dialog(page).getByText("Fast, cheapest")).toBeVisible();
    await expect(
      dialog(page).getByText("Better", { exact: true }),
    ).toBeVisible();
    await expect(dialog(page).getByText("Best", { exact: true })).toBeVisible();
    await dialog(page)
      .getByRole("radio", { name: /Sonnet 5\.5/ })
      .check();

    const cap = dialog(page).getByLabel("Stop after this many uses a month");
    await expect(cap).toHaveValue("200");
    await expect(
      dialog(page).getByText("0 of 200 used this month"),
    ).toBeVisible();
    await cap.fill("50");
    await cap.blur();
    await expect(
      dialog(page).getByText("0 of 50 used this month"),
    ).toBeVisible();

    await page.reload();
    await fontsLoaded(page);
    await openFromMore(page);
    await expect(
      dialog(page).getByRole("radio", { name: /Sonnet 5\.5/ }),
    ).toBeChecked();
    await expect(
      dialog(page).getByLabel("Stop after this many uses a month"),
    ).toHaveValue("50");
  });

  test("a cap typed and then closed with Escape is still kept (no click elsewhere needed)", async ({
    page,
  }) => {
    await openFromMore(page);
    await dialog(page)
      .getByLabel("Stop after this many uses a month")
      .fill("50");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await openFromMore(page);
    await expect(
      dialog(page).getByLabel("Stop after this many uses a month"),
    ).toHaveValue("50");
  });

  test("a nonsense cap goes back to the saved number", async ({ page }) => {
    await openFromMore(page);
    const cap = dialog(page).getByLabel("Stop after this many uses a month");
    await cap.fill("0");
    await cap.blur();
    await expect(cap).toHaveValue("200");
  });
});

test.describe("on a phone", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 800 },
  });

  test("opens from the ⋯ sheet and fits the screen", async ({ page }) => {
    await page.goto("/");
    await fontsLoaded(page);
    await page
      .getByRole("toolbar", { name: "Board actions" })
      .getByRole("button", { name: "More", exact: true })
      .tap();
    const sheet = page.getByRole("dialog", { name: "More" });
    await sheet.getByRole("button", { name: "AI settings", exact: true }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    const d = (await dialog(page).boundingBox())!;
    expect(d.x).toBeGreaterThanOrEqual(0);
    expect(d.x + d.width).toBeLessThanOrEqual(390);
    // 16px text so the phone does not zoom the page when the box takes the cursor.
    expect(
      await keyBox(page).evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16);
    const save = dialog(page).getByRole("button", { name: "Save key" });
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await dialog(page).getByRole("button", { name: "Close" }).tap();
    await expect(dialog(page)).toHaveCount(0);
  });
});
