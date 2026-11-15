import { expect, test, type Locator, type Page } from "@playwright/test";
import { add, freshBoardEachTest } from "./helpers";

// Checklist panel keyboard and focus fixes (code review, 2026-11-15).

freshBoardEachTest();

const button = (page: Page) =>
  page
    .locator(".corner-controls")
    .getByRole("button", { name: "Checklist", exact: true });
const panel = (page: Page) =>
  page.getByRole("complementary", { name: "Checklist", exact: true });
const items = (l: Locator) => l.getByLabel("Item text");
const texts = (l: Locator) =>
  items(l).evaluateAll((els) =>
    els.map((el) => (el as HTMLTextAreaElement).value),
  );
const box = async (l: Locator) => (await l.boundingBox())!;

async function openWith(page: Page, list: string[]) {
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  for (const [i, t] of list.entries()) {
    if (i) await page.keyboard.press("Enter");
    await page.keyboard.type(t);
  }
}

async function noteOnBoard(page: Page, text: string) {
  await add(page, "Note");
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

/** Opens the Main checklist board itself (from a search on all boards), with the panel still open. */
async function openMainBoard(page: Page) {
  await page.mouse.click(1000, 820);
  await page.keyboard.press("Control+f");
  await page.getByRole("searchbox", { name: "Search the board" }).fill("zebra");
  await page
    .getByRole("search")
    .getByRole("button", { name: "All boards", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search the board" })
    .press("Enter");
  await expect(page.getByLabel("Board name")).toHaveValue("Main checklist");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeVisible();
}

test("keys do not act on items selected in the panel while a dialog is open", async ({
  page,
}) => {
  await openWith(page, ["a", "b", "c"]);
  await items(panel(page)).first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+a");
  await expect(panel(page).locator(".todo-item.picked")).toHaveCount(3);
  // Open Brain dump with the keyboard-free route: the toolbar button, then Tab to a dialog button.
  await page
    .locator("header.toolbar")
    .getByRole("button", { name: "Brain dump", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Brain dump" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button").first();
  await close.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Control+x");
  await expect(dialog).toBeVisible();
  expect(await texts(panel(page))).toEqual(["a", "b", "c"]);
  // Tab did not indent them either: every row starts at the same left edge.
  const xs = await panel(page)
    .locator("[data-item-id]")
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().left)),
    );
  expect(new Set(xs).size).toBe(1);
});

test("Ctrl+Z in the panel never falls through to the board behind", async ({
  page,
}) => {
  await noteOnBoard(page, "keep me");
  await openWith(page, ["one"]);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+z"); // takes the new item back
  await expect.poll(() => texts(panel(page))).toEqual(["one"]);
  // The keyboard stays in the panel, so the next Ctrl+Z is the checklist's, not the board's.
  await expect
    .poll(() =>
      page.evaluate(
        () => !!document.activeElement?.closest(".checklist-panel"),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".canvas [data-card-id]")).toHaveCount(1);
  await expect(page.locator(".canvas [data-card-id]")).toContainText("keep me");
});

test("with the Main checklist board open, Enter in its copy keeps the cursor there, not in the panel", async ({
  page,
}) => {
  await openWith(page, ["zebra first", "yak second"]);
  await openMainBoard(page);
  const onBoard = page.locator(".canvas [data-card-id]").first();
  await expect(items(onBoard)).toHaveCount(2);
  await items(onBoard).first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(items(onBoard)).toHaveCount(3);
  await page.keyboard.type("typed here");
  expect(await texts(onBoard)).toEqual([
    "zebra first",
    "typed here",
    "yak second",
  ]);
  await expect(items(onBoard).nth(1)).toBeFocused();
});

test("dragging in the panel over blank panel space never drops into the board underneath", async ({
  page,
}) => {
  await openWith(page, ["zebra first", "yak second", "third"]);
  await openMainBoard(page);
  // Pan the board so its list sits under the panel's blank space (dragging empty board with the left button).
  await page.mouse.move(1300, 800);
  await page.mouse.down();
  await page.mouse.move(700, 800, { steps: 8 });
  await page.mouse.up();
  const rows = panel(page).locator("[data-item-id]");
  const boardRows = page
    .locator(".canvas [data-card-id]")
    .first()
    .locator("[data-item-id]");
  const lastPanel = await box(rows.last());
  const lastBoard = await box(boardRows.last());
  const panelBox = await box(panel(page));
  // The board's last row, if it sits in the panel's blank space below its items, is a trap for the drop.
  const y = lastBoard.y + lastBoard.height / 2;
  const x = lastBoard.x + 60;
  expect(x).toBeLessThan(panelBox.width);
  expect(y).toBeGreaterThan(lastPanel.y + lastPanel.height + 4);
  await rows.first().hover();
  const grip = await box(
    rows.first().getByRole("button", { name: "Drag item" }),
  );
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x, grip.y + 20, { steps: 4 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
  expect(await texts(panel(page))).toEqual([
    "zebra first",
    "yak second",
    "third",
  ]);
});
