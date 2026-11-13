import { test, expect } from "@playwright/test";

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const stamp = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString();
function season(id, overrides = {}) {
  return {
    id: `show-${id}-season-1`, showId: id, showName: `Drama ${id}`, season: 1,
    episodeCount: 12, finaleEpisode: 12, finaleDate: day(-2), readyAt: stamp(-2),
    service: "tvN", runtime: 60, genres: ["Comedy", "Romance"], language: "Korean",
    type: "Scripted", drama: "korean", format: "standard", aliases: [], image: null,
    sourceUrl: `https://www.tvmaze.com/shows/${id}`, officialSite: null, ...overrides
  };
}
function fixture() {
  const finales = [
    season(1, { showName: "Morning Letters", aliases: ["아침 편지"], officialSite: "https://www.netflix.com/title/81681535" }),
    season(2, { showName: "Old Summer", finaleDate: day(-80), readyAt: stamp(-80) }),
    season(3, { showName: "Brief Encounter", language: "Chinese", drama: "chinese", runtime: 5, format: "short", service: "Youku" }),
    season(4, { showName: "Unknown Length", language: "Japanese", drama: "japanese", runtime: null, format: "unknown", service: "NHK" }),
    season(5, { showName: "Taipei Afternoons", language: "Chinese", drama: "chinese", runtime: 45, service: "Viki" })
  ];
  return {
    schemaVersion: 3, generatedAt: stamp(0), finales,
    upcoming: [season(6, { showName: "Tomorrow's Promise", finaleDate: day(5), readyAt: stamp(5) })],
    filters: { genres: ["Comedy", "Romance"], services: ["NHK", "tvN", "Viki", "Youku"] }
  };
}

async function openFixture(page, data = fixture()) {
  await page.route("**/data/finales.json", (route) => route.fulfill({ json: data }));
  await page.goto("./");
  await expect(page.locator("#result-count")).toContainText("season");
}

test("defaults to standard-length dramas including unknown runtimes, without popularity filtering", async ({ page }) => {
  await openFixture(page);
  await expect(page.locator(".show-card")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Morning Letters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unknown Length" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brief Encounter" })).toHaveCount(0);
  await page.getByRole("button", { name: "Short dramas", exact: true }).click();
  await expect(page.locator(".show-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Brief Encounter" })).toBeVisible();
  await page.getByRole("button", { name: "Any length", exact: true }).click();
  await expect(page.locator(".show-card")).toHaveCount(4);
  await page.getByRole("button", { name: /J-drama/ }).click();
  await expect(page.locator(".show-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Unknown Length" })).toBeVisible();
});

test("search finds native titles and expands the date window for older archive entries", async ({ page }) => {
  await openFixture(page);
  await page.getByRole("searchbox").fill("아침");
  await expect(page.locator(".show-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Morning Letters" })).toBeVisible();
  await page.getByRole("searchbox").fill("Old Summer");
  await expect(page.getByRole("heading", { name: "Old Summer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All dates", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox").fill("No such title");
  await expect(page.locator("#empty-state")).toBeVisible();
  await page.locator("#empty-state [data-clear-filters]").click();
  await expect(page.locator(".show-card")).toHaveCount(3);
});

test("saves and watched marks persist, and watched visibility does not hide Saved only", async ({ page }) => {
  await openFixture(page);
  const card = page.locator("#show-1-season-1");
  await card.getByRole("button", { name: "Save Morning Letters", exact: true }).click();
  await expect(card.locator(".save-button")).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Mark watched Morning Letters", exact: true }).click();
  await page.reload();
  await expect(card.locator(".save-button")).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".watched-button")).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Saved only", { exact: true }).check();
  await expect(page.locator(".show-card")).toHaveCount(1);
  await page.getByLabel("Hide watched", { exact: true }).check();
  await expect(page.locator("#empty-state")).toBeVisible();
  await page.getByLabel("Hide watched", { exact: true }).uncheck();
  await expect(card).toBeVisible();
});

test("a saved season remains available after leaving the downloaded archive", async ({ page }) => {
  const data = fixture();
  await openFixture(page, data);
  await page.getByRole("button", { name: "Save Morning Letters", exact: true }).click();
  data.finales = data.finales.filter((item) => item.showId !== 1);
  await page.reload();
  await expect(page.locator("#show-1-season-1")).toHaveCount(0);
  await page.getByLabel("Saved only", { exact: true }).check();
  await expect(page.locator("#show-1-season-1")).toBeVisible();
});

test("one-tap provider links include the title and remember the selected service", async ({ page }) => {
  await openFixture(page);
  const card = page.locator("#show-1-season-1");
  await expect(card.locator(".stream-link")).toHaveAttribute("href", "https://www.viki.com/search?q=Morning+Letters");
  await expect(card.locator(".official-link")).toHaveAttribute("href", "https://www.netflix.com/title/81681535");
  await page.locator(".stream-settings summary").click();
  await page.getByRole("combobox", { name: "Find shows on", exact: true }).selectOption("iqiyi");
  await expect(card.locator(".stream-link")).toHaveText("Find on iQIYI");
  await expect(card.locator(".stream-link")).toHaveAttribute("href", "https://www.iq.com/search?query=Morning+Letters");
  await page.reload();
  await expect(card.locator(".stream-link")).toHaveText("Find on iQIYI");
  await page.context().route("https://www.iq.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Streaming search</title>" }));
  const popupPromise = page.waitForEvent("popup");
  await card.locator(".stream-link").click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://www.iq.com/search?query=Morning+Letters");
  await expect(popup).toHaveTitle("Streaming search");
});

test("upcoming and original-network/genre filters work without claiming streaming availability", async ({ page }) => {
  await openFixture(page);
  await page.getByRole("button", { name: /Coming up/ }).click();
  await expect(page.getByRole("heading", { name: "Tomorrow's Promise" })).toBeVisible();
  await expect(page.locator(".watched-button")).toHaveCount(0);
  await expect(page.locator("#hide-watched-control")).toBeHidden();
  await page.getByRole("button", { name: /Binge-ready/ }).click();
  await page.locator(".more-filters summary").click();
  await page.getByRole("combobox", { name: "Original network / platform", exact: true }).selectOption("Viki");
  await expect(page.locator(".show-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Taipei Afternoons" })).toBeVisible();
  await page.getByRole("combobox", { name: "Genre", exact: true }).selectOption("Romance");
  await expect(page.locator(".show-card")).toHaveCount(1);
});

test("supports season permalinks and safely ignores malformed hashes", async ({ page }) => {
  await page.route("**/data/finales.json", (route) => route.fulfill({ json: fixture() }));
  await page.goto("./#show-3-season-1");
  await expect(page.getByRole("heading", { name: "Brief Encounter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Any length", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("./#%5Binvalid");
  await expect(page.locator("#error-state")).toBeHidden();
});

test("failed data loads can be retried without duplicate filter choices", async ({ page }) => {
  let fail = true;
  await page.route("**/data/finales.json", (route) => fail
    ? route.fulfill({ status: 503 })
    : route.fulfill({ json: fixture() }));
  await page.goto("./");
  await expect(page.locator("#error-state")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".show-card")).toHaveCount(3);
  await expect(page.locator("#genre option")).toHaveCount(3);
  await expect(page.locator("#service option")).toHaveCount(5);
});

test("works with browser storage blocked and has no horizontal overflow", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  });
  await openFixture(page);
  await page.getByRole("button", { name: "Save Morning Letters", exact: true }).click();
  await expect(page.locator("#storage-note")).toBeVisible();
  await expect(page.locator("#show-1-season-1 .save-button")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("loads more results and retains keyboard focus on save controls", async ({ page }) => {
  const data = fixture();
  data.finales = Array.from({ length: 45 }, (_, index) => season(index + 100));
  await openFixture(page, data);
  await expect(page.locator(".show-card")).toHaveCount(36);
  await page.getByRole("button", { name: "Show 9 more", exact: true }).click();
  await expect(page.locator(".show-card")).toHaveCount(45);
  const button = page.getByRole("button", { name: "Save Drama 100", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Unsave Drama 100", exact: true })).toBeFocused();
});

test("checked-in real data loads and all three drama categories render", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#result-count")).toContainText("season");
  await expect(page.locator("#error-state")).toBeHidden();
  const poster = page.locator(".show-card__poster").first();
  await poster.scrollIntoViewIfNeeded();
  await expect.poll(() => poster.evaluate((image) => image.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("initial-feed.png") });
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  for (const category of ["K-drama", "C-drama", "J-drama"]) {
    await page.getByRole("button", { name: new RegExp(category) }).click();
    await expect(page.locator(".show-card").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("j-drama-feed.png") });
});
