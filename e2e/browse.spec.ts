import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  EXPECTED_MODULE_DOWNLOADS,
  EXPECTED_MODULES,
  EXPECTED_PROVIDERS,
} from "./fixtures";

const PAGE_SIZE = 15;

interface CardSummary {
  key: string;
  version: string;
}

/** Card key (from its href) and the version badge it shows, in render order. */
async function readCards(cards: Locator): Promise<CardSummary[]> {
  return cards.evaluateAll((links) =>
    links.map((link) => ({
      key: link.getAttribute("href") ?? "",
      version:
        [...link.querySelectorAll("*")]
          .filter((el) => el.childElementCount === 0)
          .map((el) => el.textContent?.trim() ?? "")
          .find((text) => /^v\d/.test(text)) ?? "",
    })),
  );
}

/** Cards must sit in the 3-column grid: row-aligned, inside the viewport. */
async function expectGridLayout(page: Page, cards: Locator): Promise<void> {
  const boxes = await cards.evaluateAll((links) =>
    links.map((link) => {
      const r = link.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height };
    }),
  );
  const viewportWidth = page.viewportSize()!.width;
  for (const box of boxes) {
    expect(box.w).toBeGreaterThan(200);
    expect(box.h).toBeGreaterThan(80);
    expect(box.x + box.w).toBeLessThanOrEqual(viewportWidth);
  }
  if (boxes.length >= 3) {
    expect(new Set(boxes.slice(0, 3).map((b) => b.y)).size).toBe(1);
    expect(new Set(boxes.slice(0, 3).map((b) => b.x)).size).toBe(3);
  }
}

/** Full-page capture kept in the test output dir for visual review. */
async function snapshot(page: Page, name: string): Promise<void> {
  const path = test.info().outputPath(`${name}.png`);
  // Pagination leaves scrollY > 0; reset so the sticky header isn't stitched mid-image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
  await test.info().attach(name, { path, contentType: "image/png" });
}

const showing = (page: Page) => page.getByText(/^Showing \d+ to \d+ of \d+$/);

const moduleCards = (page: Page) => page.locator('a[href^="/modules/acme/"]');
const providerCards = (page: Page) => page.locator('a[href^="/providers/acme/"]');

const expectedModuleCards = EXPECTED_MODULES.map((m) => ({
  key: `/modules/${m.namespace}/${m.name}/${m.provider}`,
  version: `v${m.version}`,
}));
const expectedProviderCards = EXPECTED_PROVIDERS.map((p) => ({
  key: `/providers/${p.namespace}/${p.type}`,
  version: `v${p.version}`,
}));

test.describe("modules browse", () => {
  test("pages through every unique module, newest version each", async ({ page }) => {
    await page.goto("/modules");
    await expect(page.locator("h1 + *", { hasText: /^\d+$/ })).toHaveText(
      String(EXPECTED_MODULES.length),
    );
    await expect(moduleCards(page)).toHaveCount(PAGE_SIZE);
    expect(await readCards(moduleCards(page))).toEqual(
      expectedModuleCards.slice(0, PAGE_SIZE),
    );
    await expect(showing(page)).toHaveText(
      `Showing 1 to ${PAGE_SIZE} of ${EXPECTED_MODULES.length}`,
    );
    await expectGridLayout(page, moduleCards(page));
    await snapshot(page, "modules-page-1");

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/[?&]offset=15\b/);
    await expect(moduleCards(page)).toHaveCount(EXPECTED_MODULES.length - PAGE_SIZE);
    expect(await readCards(moduleCards(page))).toEqual(
      expectedModuleCards.slice(PAGE_SIZE),
    );
    await expect(showing(page)).toHaveText(
      `Showing 16 to ${EXPECTED_MODULES.length} of ${EXPECTED_MODULES.length}`,
    );
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await expectGridLayout(page, moduleCards(page));
    await snapshot(page, "modules-page-2");

    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page).not.toHaveURL(/offset=/);
    await expect(moduleCards(page)).toHaveCount(PAGE_SIZE);
  });
});

test.describe("providers browse", () => {
  test("pages through every unique provider, newest version each", async ({ page }) => {
    await page.goto("/providers");
    await expect(page.locator("h1 + *", { hasText: /^\d+$/ })).toHaveText(
      String(EXPECTED_PROVIDERS.length),
    );
    await expect(providerCards(page)).toHaveCount(PAGE_SIZE);
    expect(await readCards(providerCards(page))).toEqual(
      expectedProviderCards.slice(0, PAGE_SIZE),
    );
    await expectGridLayout(page, providerCards(page));
    await snapshot(page, "providers-page-1");

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/[?&]offset=15\b/);
    await expect(providerCards(page)).toHaveCount(EXPECTED_PROVIDERS.length - PAGE_SIZE);
    expect(await readCards(providerCards(page))).toEqual(
      expectedProviderCards.slice(PAGE_SIZE),
    );
    // The multi-release provider shows its newest prerelease and platform count.
    const cloudflare = providerCards(page).filter({ hasText: "cloudflare" });
    await expect(cloudflare).toContainText("v5.22.0-beta.7");
    await expect(cloudflare).toContainText("8 platforms");
    await expectGridLayout(page, providerCards(page));
    await snapshot(page, "providers-page-2");
  });
});

test.describe("home", () => {
  test("stats and search results list distinct entries", async ({ page }) => {
    await page.goto("/");
    const stat = (label: string) =>
      page.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=preceding-sibling::p[1]");
    await expect(stat("Modules")).toHaveText(String(EXPECTED_MODULES.length));
    await expect(stat("Providers")).toHaveText(String(EXPECTED_PROVIDERS.length));
    await expect(stat("Downloads")).toHaveText(
      new Intl.NumberFormat("en-US").format(EXPECTED_MODULE_DOWNLOADS),
    );
    await snapshot(page, "home");

    await page.goto("/?q=a");
    const modulesHit = expectedModuleCards.filter((c) => c.key.split("/")[3]?.includes("a"));
    const providersHit = expectedProviderCards.filter((c) => c.key.split("/")[3]?.includes("a"));
    await expect(moduleCards(page)).toHaveCount(Math.min(6, modulesHit.length));
    await expect(providerCards(page)).toHaveCount(Math.min(6, providersHit.length));
    expect(await readCards(moduleCards(page))).toEqual(modulesHit.slice(0, 6));
    expect(await readCards(providerCards(page))).toEqual(providersHit.slice(0, 6));
    await snapshot(page, "home-search");
  });
});
