import assert from "node:assert/strict";
import test from "node:test";
import {
  dramaFor, episodeFormat, matchesLength, matchesSearch, officialShowLink, streamingLink
} from "../site/lib/dramas.js";
import {
  carryForwardReadyFinales, findConfirmedFinales,
  findConfirmedUpcomingFinales, normalizeEpisode
} from "../scripts/lib/finales.mjs";

test("includes live-action dramas regardless of popularity or literal Drama genre", () => {
  assert.equal(dramaFor({ type: "Scripted", language: "Korean", weight: 0, genres: ["Comedy"] }).id, "korean");
  assert.equal(dramaFor({ type: "Scripted", language: "Cantonese" }).id, "chinese");
  assert.equal(dramaFor({ type: "Scripted", language: "Mandarin" }).id, "chinese");
  assert.equal(dramaFor({ type: "Scripted", language: "Japanese" }).id, "japanese");
  for (const type of ["Animation", "Reality", "Variety", "Talk Show"]) {
    assert.equal(dramaFor({ type, language: "Japanese" }), null);
  }
  assert.equal(dramaFor({ type: "Scripted", language: "English" }), null);
  assert.equal(dramaFor(null), null);
});

test("standard-length includes the 20-minute boundary and unknown runtimes", () => {
  assert.equal(matchesLength({ runtime: 19 }, "standard"), false);
  assert.equal(matchesLength({ runtime: 20 }, "standard"), true);
  for (const runtime of [null, undefined, 0, -1, Number.NaN]) {
    assert.equal(episodeFormat(runtime), "unknown");
    assert.equal(matchesLength({ runtime }, "standard"), true);
    assert.equal(matchesLength({ runtime }, "short"), false);
  }
  assert.equal(matchesLength({ runtime: 2 }, "short"), true);
  assert.equal(matchesLength({ runtime: 2 }, "all"), true);
});

test("searches original titles, aliases, and accents without episode spoilers", () => {
  const item = {
    showName: "Summer Café", aliases: ["여름 카페", "Xia Ri"], language: "Korean",
    type: "Scripted", service: "tvN", genres: ["Comedy", "Romance"],
    finaleName: "The killer is revealed"
  };
  assert.equal(matchesSearch(item, "summer cafe"), true);
  assert.equal(matchesSearch(item, "여름"), true);
  assert.equal(matchesSearch(item, "xia ri"), true);
  assert.equal(matchesSearch(item, "K-drama comedy"), true);
  assert.equal(matchesSearch(item, "killer"), false);
});

test("encodes full titles in verified service search routes", () => {
  const title = "Love & Lies / 사랑? #2";
  for (const [service, host, parameter] of [
    ["viki", "www.viki.com", "q"], ["iqiyi", "www.iq.com", "query"],
    ["wetv", "wetv.vip", "q"], ["netflix", "www.netflix.com", "q"],
    ["justwatch", "www.justwatch.com", "q"]
  ]) {
    const url = new URL(streamingLink(service, title).url);
    assert.equal(url.hostname, host);
    assert.equal(url.searchParams.get(parameter), title);
  }
  assert.equal(streamingLink("corrupted-preference", title).name, "Viki");
});

test("only offers HTTPS official links on recognized streaming domains", () => {
  assert.equal(officialShowLink("https://www.netflix.com/title/81681535").name, "Netflix");
  assert.equal(officialShowLink("https://www.viki.com/tv/39931c-hidden-love").name, "Viki");
  for (const url of [
    "javascript:alert(1)", "http://www.viki.com/tv/1", "https://viki.com.evil.example/tv/1",
    "https://evilyviki.com/tv/1", "https://person:password@viki.com/tv/1",
    "https://www.viki.com/", null, ""
  ]) assert.equal(officialShowLink(url), null);
});

test("classifies episode length by typical runtime but waits for the full broadcast finale", () => {
  const item = normalizeEpisode({
    id: 8, season: 1, number: 8, airdate: "2026-11-14", airstamp: "2026-11-13T23:00:00Z",
    runtime: 60, show: {
      id: 10, name: "Midnight Drama", type: "Scripted", language: "Japanese",
      averageRuntime: 15, network: { name: "Example", country: { code: "JP", name: "Japan" } }
    }
  });
  assert.equal(item.runtime, 15);
  assert.equal(item.readyAt, "2026-11-14T00:00:00.000Z");
  const finales = findConfirmedFinales({
    episodes: [{ ...item, readyAt: "2026-11-13T23:30:00.000Z" }],
    seasonsByShow: new Map([["10", [{ number: 1, episodeOrder: 8, endDate: "2026-11-14" }]]]),
    now: "2026-11-13T23:45:00.000Z", today: "2026-11-13", lookbackDays: 120
  });
  assert.equal(finales.length, 1);
  assert.equal(finales[0].daysAgo, 0);
});

test("does not mark an untimed broadcast complete when runtime is unknown", () => {
  const item = normalizeEpisode({
    id: 1, season: 1, number: 12, airdate: "2026-11-13", airstamp: "2026-11-13T22:00:00Z",
    runtime: null, show: {
      id: 10, name: "Unknown Duration", type: "Scripted", language: "Korean",
      network: { name: "Example", country: { code: "KR", name: "South Korea" } }
    }
  });
  assert.equal(item.readyAt, null);
});

test("withdrawn or missing season metadata cannot promote or preserve an old finale", () => {
  const old = {
    id: "show-10-season-1", showId: 10, showName: "Postponed Drama", season: 1,
    finaleEpisode: 12, finaleDate: "2026-11-10", readyAt: "2026-11-10T12:00:00.000Z"
  };
  for (const seasons of [
    [], [{ number: 1, episodeOrder: null, endDate: null }],
    [{ number: 1, episodeOrder: 14, endDate: "2026-11-15" }]
  ]) {
    for (const list of ["finales", "upcoming"]) {
      const result = carryForwardReadyFinales({
        previousDataset: { [list]: [old] }, currentFinales: [], currentUpcoming: [],
        futureEpisodes: [], seasonsByShow: new Map([["10", seasons]]),
        now: "2026-11-13T12:00:00.000Z", today: "2026-11-13", lookbackDays: 120
      });
      assert.equal(result.length, 0);
    }
  }
});

test("a known later episode contradicts an ending even without a calculable runtime", () => {
  const completed = {
    id: 12, showId: 10, showName: "Extended Drama", type: "Scripted", language: "Korean",
    season: 1, number: 12, airdate: "2026-11-10", airstamp: "2026-11-10T12:00:00Z",
    readyAt: "2026-11-10T13:00:00.000Z", genres: []
  };
  const later = {
    ...completed, id: 13, number: 13, runtime: null, readyAt: null,
    airdate: "2026-11-15", airstamp: "2026-11-15T12:00:00Z"
  };
  const options = {
    seasonsByShow: new Map([["10", [{ number: 1, episodeOrder: 12, endDate: null }]]]),
    now: "2026-11-13T12:00:00.000Z", today: "2026-11-13", lookbackDays: 120
  };
  assert.equal(findConfirmedFinales({
    ...options, episodes: [completed], futureEpisodes: [later]
  }).length, 0);
  assert.equal(findConfirmedFinales({
    ...options, episodes: [completed, { ...later, airdate: "2026-11-12", airstamp: "2026-11-12T12:00:00Z" }]
  }).length, 0);
  assert.equal(findConfirmedUpcomingFinales({
    ...options, upcomingDays: 180, futureEpisodes: [
      { ...completed, airdate: "2026-11-14", readyAt: "2026-11-14T13:00:00.000Z" }, later
    ]
  }).length, 0);
  assert.equal(carryForwardReadyFinales({
    ...options, currentFinales: [], currentUpcoming: [], futureEpisodes: [later],
    previousDataset: {
      upcoming: [{
        ...completed, id: "show-10-season-1", finaleEpisode: 12,
        finaleDate: completed.airdate
      }]
    }
  }).length, 0);
});
