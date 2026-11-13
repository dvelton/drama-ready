# Drama Ready

Find K-drama, C-drama, and J-drama seasons that have finished airing, and see when upcoming seasons are scheduled to finish.

**Open the app: https://dvelton.github.io/drama-ready/**

## How to use it

1. Pick All dramas, K-drama, C-drama, or J-drama.
2. Browse Ready now or Coming up. Results are ordered by the original season finale date.
3. Search a title, including alternate and original-language titles listed by TVMaze.
4. Save a season for later or mark it watched. Saved only brings back your saved seasons; Hide watched clears finished shows out of your way.
5. Tap Find on Viki to open a search with the show's title already entered. To use iQIYI, WeTV, Netflix, or JustWatch instead, choose it under Streaming shortcut. The app remembers that service in this browser.

The initial view shows the past 30 days of standard-length dramas: episodes of 20 minutes or longer, plus shows with unlisted runtimes. Short dramas and Any length are one tap away. No popularity or rating threshold is applied.

Saved seasons and watched marks stay in the current browser. They do not sync between a phone and computer. A saved season remains in your browser's saved list after leaving the recent-finale archive. Clearing browser data removes these choices.

## Where to watch

Streaming shortcuts open external title searches, not video playback. They do **not** establish that a service carries a show in your country, has the full season, or offers your preferred subtitles. JustWatch searches default to its US site.

When TVMaze supplies an official show URL on a recognized streaming service, an additional Open show page link leads there directly. Original network / platform describes the original release, rather than a verified current streaming option.

No API key or Drama Ready account is required. Streaming services may require their own subscription or account.

## How it works

A scheduled GitHub Actions job downloads public broadcast and streaming schedules from TVMaze each day. It keeps live-action scripted shows in Korean, Chinese (including Mandarin and Cantonese), or Japanese. C-drama includes Chinese-language shows from Taiwan and Hong Kong; categories are based on language, not inferred production nationality.

A season enters the feed only when the scheduled final episode matches TVMaze's published season episode count, any published end date agrees, and no known later episode contradicts it. A stopped weekly schedule or a gap between episodes does not qualify as a confirmed finale.

Broadcast episodes become complete after the scheduled start plus the episode runtime; streaming episodes use the published release timestamp. Dates describe the original release. A streaming service may release episodes or subtitles later.

The app is a static website. Your browser downloads the prepared list rather than making hundreds of API requests. Posters load from TVMaze. Supported browsers cache the app and previously loaded data for offline browsing; opening a streaming service requires a connection.

## Coverage and limitations

- Broadcast schedules: South Korea, mainland China, Japan, Taiwan, and Hong Kong, plus worldwide web/streaming schedules.
- The default archive covers 120 days of finales and up to 180 days of published future finales. Title search searches this feed and your saved seasons, not an all-time drama catalogue.
- Anime, reality, variety shows, and movies are outside the scope.
- Missing, incomplete, or incorrect source records can cause omissions or incorrect dates. Nothing here guarantees regional access, subtitle completion, or an unchanged future schedule.
- Standard/short classification uses the show's average episode runtime when supplied, with other published runtime fields as fallbacks. Total viewing time is an estimate.

## Run from the repository

Use Node.js 22 or later. The website and data-refresh scripts have no third-party runtime dependencies. The only development dependency is Playwright for browser tests.

```bash
git clone https://github.com/dvelton/drama-ready.git
cd drama-ready
npm ci --ignore-scripts
npm run check
npm run serve
```

Open http://localhost:4173/drama-ready/.

To run desktop, Android-sized, and iPhone/WebKit browser tests:

```bash
npx playwright install chromium webkit
npm run test:browser
```

To refresh the public data:

```bash
npm run refresh
```

An initial refresh takes several minutes. Requests are paced to respect TVMaze's rate limits; later refreshes reuse the local `data-cache/`. A transient API failure fails the refresh rather than publishing a partial replacement.

## Hosting

This project deploys the `site/` folder to GitHub Pages with the included workflow. In repository Settings > Pages, use GitHub Actions as the source. A daily scheduled run and the workflow's Run workflow button refresh the data and deploy it. A push deploys the checked-in dataset after running tests and validation.

## Credits and licensing

Built by Dan Velton, based on [Binge Ready](https://github.com/dvelton/binge-ready).

Application code is MIT licensed. TVMaze data, including the adapted dataset and RSS feed, is separately attributed and licensed under CC BY-SA 4.0; see [DATA-LICENSE.md](DATA-LICENSE.md). Streaming-service names identify outbound destinations and do not imply endorsement or partnership.
