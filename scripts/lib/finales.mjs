import { dramaFor, episodeFormat } from "../../site/lib/dramas.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_TYPES = new Set(["Award Show", "News", "Panel Show", "Sports", "Talk Show"]);

export function dateOnly(value) {
  return new Date(`${value}T12:00:00Z`);
}

export function daysBetween(later, earlier) {
  return Math.floor((dateOnly(later) - dateOnly(earlier)) / DAY_MS);
}

export function normalizeEpisode(item) {
  const show = item._embedded?.show ?? item.show;
  if (!show || !item.airdate || !Number.isInteger(item.season) || item.season < 1) {
    return null;
  }

  const channel = show.webChannel ?? show.network;
  const country = channel?.country;
  const isStreaming = Boolean(show.webChannel);
  const runtime = show.averageRuntime ?? show.runtime ?? item.runtime ?? null;
  const finaleRuntime = item.runtime ?? runtime;
  const startsAt = item.airstamp ? Date.parse(item.airstamp) : Number.NaN;
  const readyAt = Number.isFinite(startsAt)
    ? isStreaming || finaleRuntime
      ? new Date(startsAt + (!isStreaming ? finaleRuntime * 60_000 : 0)).toISOString()
      : null
    : null;

  return {
    id: item.id,
    showId: show.id,
    showName: show.name,
    showUrl: show.url,
    season: item.season,
    number: item.number,
    episodeName: item.name,
    airdate: item.airdate,
    airstamp: item.airstamp,
    runtime,
    readyAt,
    isStreaming,
    image: show.image?.medium ?? null,
    originalImage: show.image?.original ?? null,
    genres: show.genres ?? [],
    language: show.language ?? null,
    showStatus: show.status ?? null,
    showEnded: show.ended ?? null,
    premiered: show.premiered ?? null,
    service: channel?.name ?? "Unknown",
    countryCode: country?.code ?? (show.webChannel ? "Global" : "Unknown"),
    countryName: country?.name ?? (show.webChannel ? "Global" : "Unknown"),
    officialSite: show.officialSite ?? null,
    type: show.type ?? null,
    weight: show.weight ?? 0,
    rating: show.rating?.average ?? null
  };
}

function compareEpisodes(left, right) {
  const dateOrder = left.airdate.localeCompare(right.airdate);
  if (dateOrder !== 0) {
    return dateOrder;
  }
  return (left.number ?? -1) - (right.number ?? -1);
}

function latestEligibleEpisodes(episodes, now, today, lookbackDays) {
  const bySeason = new Map();

  for (const episode of episodes) {
    if (
      !episode ||
      !episode.readyAt ||
      episode.readyAt > now ||
      episode.number == null ||
      EXCLUDED_TYPES.has(episode.type)
    ) {
      continue;
    }

    const age = Math.max(0, daysBetween(today, episode.airdate));
    if (age >= lookbackDays) {
      continue;
    }

    const key = `${episode.showId}:${episode.season}`;
    const current = bySeason.get(key);
    if (!current || compareEpisodes(current, episode) < 0) {
      bySeason.set(key, episode);
    }
  }

  return bySeason;
}

function futureSeasonKeys(futureEpisodes, now) {
  return new Set(
    futureEpisodes
      .filter((episode) => {
        if (!episode || episode.number == null) return false;
        const scheduled = Date.parse(episode.readyAt ?? episode.airstamp);
        return Number.isFinite(scheduled)
          ? scheduled > Date.parse(now)
          : Boolean(episode.airdate && episode.airdate >= now.slice(0, 10));
      })
      .map((episode) => `${episode.showId}:${episode.season}`)
  );
}

function latestScheduledNumbers(episodes) {
  const numbers = new Map();
  for (const episode of episodes) {
    if (!episode || !Number.isInteger(episode.number)) continue;
    const key = `${episode.showId}:${episode.season}`;
    numbers.set(key, Math.max(numbers.get(key) ?? 0, episode.number));
  }
  return numbers;
}

export function findMetadataShowIds({
  episodes,
  futureEpisodes = [],
  now,
  today,
  lookbackDays,
  upcomingDays
}) {
  const bySeason = latestEligibleEpisodes(episodes, now, today, lookbackDays);
  const futureKeys = futureSeasonKeys(futureEpisodes, now);
  const upcomingLimit = new Date(
    dateOnly(today).getTime() + upcomingDays * DAY_MS
  ).toISOString().slice(0, 10);
  const showIds = new Set(
    [...bySeason.entries()]
      .filter(([key]) => !futureKeys.has(key))
      .map(([, episode]) => String(episode.showId))
  );

  for (const episode of futureEpisodes) {
    if (
      episode &&
      episode.readyAt &&
      episode.readyAt > now &&
      episode.airdate <= upcomingLimit &&
      episode.number != null &&
      !EXCLUDED_TYPES.has(episode.type)
    ) {
      showIds.add(String(episode.showId));
    }
  }

  return [...showIds];
}

function buildFinaleRecord(episode, season, confirmation) {
  const service = season.webChannel?.name ?? season.network?.name ?? episode.service;

  return {
    id: `show-${episode.showId}-season-${episode.season}`,
    showId: episode.showId,
    showName: episode.showName,
    showUrl: episode.showUrl,
    season: episode.season,
    seasonName: season.name ?? null,
    finaleEpisode: episode.number,
    finaleName: episode.episodeName,
    finaleDate: episode.airdate,
    readyAt: episode.readyAt,
    episodeCount: season.episodeOrder ?? episode.number,
    runtime: episode.runtime,
    image: season.image?.medium ?? episode.image,
    originalImage: season.image?.original ?? episode.originalImage,
    genres: episode.genres,
    language: episode.language,
    type: episode.type,
    showStatus: episode.showStatus,
    service,
    countryCode:
      season.webChannel?.country?.code ??
      season.network?.country?.code ??
      episode.countryCode,
    countryName:
      season.webChannel?.country?.name ??
      season.network?.country?.name ??
      episode.countryName,
    officialSite: episode.officialSite,
    isSeriesFinale:
      Boolean(episode.showEnded) && episode.showEnded === episode.airdate,
    aliases: [],
    sourceUrl: episode.showUrl,
    confirmation
  };
}

function matchingSeason(episode, seasonsByShow) {
  const seasons = seasonsByShow.get(String(episode.showId)) ?? [];
  return seasons.find((item) => item.number === episode.season);
}

function confirmationMethod(episode, season, hasLaterScheduledEpisode) {
  if (
    !season ||
    !Number.isInteger(season.episodeOrder) ||
    season.episodeOrder !== episode.number ||
    hasLaterScheduledEpisode
  ) {
    return null;
  }
  if (season.endDate && season.endDate !== episode.airdate) {
    return null;
  }
  return "episode-order";
}

export function findConfirmedFinales({
  episodes,
  seasonsByShow,
  futureEpisodes = [],
  now,
  today,
  lookbackDays
}) {
  const bySeason = latestEligibleEpisodes(episodes, now, today, lookbackDays);
  const futureKeys = futureSeasonKeys(futureEpisodes, now);
  const scheduledNumbers = latestScheduledNumbers([...episodes, ...futureEpisodes]);
  const finales = [];

  for (const [key, episode] of bySeason) {
    const season = matchingSeason(episode, seasonsByShow);
    const confirmation = confirmationMethod(
      episode,
      season,
      futureKeys.has(key) || scheduledNumbers.get(key) > episode.number
    );
    if (!confirmation) {
      continue;
    }

    finales.push({
      ...buildFinaleRecord(episode, season, confirmation),
      daysAgo: Math.max(0, daysBetween(today, episode.airdate))
    });
  }

  return finales.sort(
    (left, right) =>
      right.finaleDate.localeCompare(left.finaleDate) ||
      left.showName.localeCompare(right.showName) ||
      right.season - left.season
  );
}

export function findConfirmedUpcomingFinales({
  futureEpisodes,
  seasonsByShow,
  now,
  today,
  upcomingDays
}) {
  const bySeason = new Map();
  const upcomingLimit = new Date(
    dateOnly(today).getTime() + upcomingDays * DAY_MS
  ).toISOString().slice(0, 10);

  for (const episode of futureEpisodes) {
    if (
      !episode ||
      !episode.readyAt ||
      episode.readyAt <= now ||
      episode.number == null ||
      EXCLUDED_TYPES.has(episode.type)
    ) {
      continue;
    }

    const key = `${episode.showId}:${episode.season}`;
    const current = bySeason.get(key);
    if (!current || compareEpisodes(current, episode) < 0) {
      bySeason.set(key, episode);
    }
  }

  const upcoming = [];
  const scheduledNumbers = latestScheduledNumbers(futureEpisodes);
  for (const episode of bySeason.values()) {
    if (episode.airdate > upcomingLimit) {
      continue;
    }

    const season = matchingSeason(episode, seasonsByShow);
    const key = `${episode.showId}:${episode.season}`;
    const confirmation = confirmationMethod(
      episode, season, scheduledNumbers.get(key) > episode.number
    );
    if (!confirmation) {
      continue;
    }

    upcoming.push({
      ...buildFinaleRecord(episode, season, confirmation),
      daysUntil: Math.max(0, daysBetween(episode.airdate, today))
    });
  }

  return upcoming.sort(
    (left, right) =>
      left.finaleDate.localeCompare(right.finaleDate) ||
      left.showName.localeCompare(right.showName) ||
      right.season - left.season
  );
}

export function carryForwardReadyFinales({
  previousDataset,
  currentFinales,
  currentUpcoming,
  futureEpisodes,
  seasonsByShow,
  now,
  today,
  lookbackDays
}) {
  const rescheduledIds = new Set(currentUpcoming.map((item) => item.id));
  const futureKeys = futureSeasonKeys(futureEpisodes, now);
  const scheduledNumbers = latestScheduledNumbers(futureEpisodes);
  const carried = [
    ...(previousDataset?.finales ?? []),
    ...(previousDataset?.upcoming ?? [])
  ].filter((item) => {
    if (!item.readyAt || item.readyAt > now || rescheduledIds.has(item.id)) {
      return false;
    }
    const seasonKey = `${item.showId}:${item.season}`;
    if (futureKeys.has(seasonKey) || scheduledNumbers.get(seasonKey) > item.finaleEpisode) {
      return false;
    }
    const currentSeason = (seasonsByShow.get(String(item.showId)) ?? []).find(
      (season) => season.number === item.season
    );
    if (
      !currentSeason ||
      !Number.isInteger(currentSeason.episodeOrder) ||
      currentSeason.episodeOrder !== item.finaleEpisode ||
      (currentSeason.endDate &&
        item.finaleDate &&
        currentSeason.endDate !== item.finaleDate)
    ) {
      return false;
    }
    const age = Math.max(0, daysBetween(today, item.finaleDate));
    return age < lookbackDays;
  });
  const merged = new Map(carried.map((item) => [item.id, item]));

  for (const item of currentFinales) {
    merged.set(item.id, item);
  }

  return [...merged.values()]
    .map((item) => ({
      ...item,
      daysAgo: Math.max(0, daysBetween(today, item.finaleDate))
    }))
    .sort(
      (left, right) =>
        right.finaleDate.localeCompare(left.finaleDate) ||
        left.showName.localeCompare(right.showName) ||
        right.season - left.season
    );
}

export function buildDataset({
  finales,
  upcoming,
  generatedAt,
  today,
  lookbackDays,
  upcomingDays
}) {
  const all = [...finales, ...upcoming];
  const genres = [...new Set(all.flatMap((item) => item.genres))].sort();
  const languages = [
    ...new Set(all.map((item) => item.language).filter(Boolean))
  ].sort();
  const services = [...new Set(all.map((item) => item.service))].sort();
  const countries = [
    ...new Map(
      all.map((item) => [
        item.countryCode,
        { code: item.countryCode, name: item.countryName }
      ])
    ).values()
  ].sort((left, right) => left.name.localeCompare(right.name));

  return {
    schemaVersion: 3,
    generatedAt,
    today,
    source: {
      name: "TVMaze",
      url: "https://www.tvmaze.com/",
      license: "CC BY-SA"
    },
    coverage: {
      lookbackDays,
      upcomingDays,
      startsOn: new Date(dateOnly(today).getTime() - (lookbackDays - 1) * DAY_MS)
        .toISOString()
        .slice(0, 10),
      endsOn: new Date(dateOnly(today).getTime() + upcomingDays * DAY_MS)
        .toISOString()
        .slice(0, 10),
      includes: ["Korea, China, Japan, Taiwan, and Hong Kong broadcast schedules", "worldwide web and streaming schedules"],
      scope: "Korean-, Chinese-, and Japanese-language live-action scripted series. No popularity or rating cutoff.",
      availability: "Original-release schedules, not regional streaming or subtitle availability.",
      formats: "Standard: 20+ minutes per episode or unknown runtime. Short: under 20 minutes."
    },
    count: finales.length,
    upcomingCount: upcoming.length,
    filters: {
      genres,
      languages,
      services,
      countries
    },
    finales: finales.map(dramaRecord),
    upcoming: upcoming.map(dramaRecord)
  };
}

function dramaRecord(item) {
  const { major, prominenceReason, weight, rating, ...record } = item;
  return {
    ...record,
    drama: dramaFor(item)?.id ?? null,
    format: episodeFormat(item.runtime),
    aliases: item.aliases ?? []
  };
}
