import {
  DRAMAS, STREAMING_SERVICES, dramaFor, episodeFormat,
  matchesLength, matchesSearch, officialShowLink, streamingLink
} from "./lib/dramas.js";

const PREFIX = "drama-ready:";
const PAGE_SIZE = 36;
const DAY = 86_400_000;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    document.querySelector("#storage-note").hidden = false;
  }
}

const storedSaved = read("saved", []);
const storedWatched = read("watched", []);
const storedRecords = read("saved-records", []);
const preferredService = read("streaming-service", "viki");
const state = {
  data: null, view: "ready", drama: "", length: "standard", range: "30",
  search: "", genre: "", service: "", savedOnly: false,
  hideWatched: read("hide-watched", false) === true,
  saved: new Set(Array.isArray(storedSaved) ? storedSaved : []),
  watched: new Set(Array.isArray(storedWatched) ? storedWatched : []),
  savedRecords: new Map(
    (Array.isArray(storedRecords) ? storedRecords : [])
      .filter((item) => item?.id && dramaFor(item) && Array.isArray(item.genres))
      .map((item) => [item.id, item])
  ),
  streamingService: STREAMING_SERVICES.some((item) => item.id === preferredService) ? preferredService : "viki",
  limit: PAGE_SIZE
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  feed: $("#feed"), search: $("#search"), service: $("#service"), genre: $("#genre"),
  savedOnly: $("#saved-only"), hideWatched: $("#hide-watched"),
  hideWatchedControl: $("#hide-watched-control"), resultCount: $("#result-count"),
  readyCount: $("#ready-count"), updatedAt: $("#updated-at"), clearFilters: $("#clear-filters"),
  emptyState: $("#empty-state"), errorState: $("#error-state"),
  template: $("#card-template"), showMore: $("#show-more"), streaming: $("#streaming-service")
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function distance(later, earlier) {
  return Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / DAY);
}

function isReady(item) {
  return Date.parse(item.readyAt) <= Date.now();
}

function timingDays(item) {
  return Math.max(0, state.view === "ready"
    ? distance(today(), item.finaleDate)
    : distance(item.finaleDate, today()));
}

function plural(value, word) {
  return `${value.toLocaleString()} ${word}${value === 1 ? "" : "s"}`;
}

function dateLabel(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC"
  }).format(date);
}

function relativeLabel(item) {
  const days = timingDays(item);
  if (state.view === "upcoming") return days === 0 ? "Later today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function allItems() {
  const saved = state.savedOnly ? [...state.savedRecords.values()] : [];
  return [...new Map([...saved, ...state.data.finales, ...state.data.upcoming].map((item) => [item.id, item])).values()];
}

function forTiming(item) {
  return state.view === "ready" ? isReady(item) : !isReady(item);
}

function filteredItems() {
  return allItems().filter((item) => {
    const days = timingDays(item);
    return forTiming(item) &&
      (!state.drama || item.drama === state.drama) &&
      matchesLength(item, state.length) &&
      (state.range === "all" || (state.view === "ready" ? days < Number(state.range) : days <= Number(state.range))) &&
      matchesSearch(item, state.search) &&
      (!state.genre || item.genres.includes(state.genre)) &&
      (!state.service || item.service === state.service) &&
      (!state.savedOnly || state.saved.has(item.id)) &&
      (state.view !== "ready" || !state.hideWatched || !state.watched.has(item.id));
  }).sort((left, right) =>
    (state.view === "ready" ? right.finaleDate.localeCompare(left.finaleDate) : left.finaleDate.localeCompare(right.finaleDate)) ||
    left.showName.localeCompare(right.showName) || left.season - right.season
  );
}

function nativeTitle(item) {
  const scripts = {
    korean: /\p{Script=Hangul}/u,
    chinese: /\p{Script=Han}/u,
    japanese: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u
  };
  return (item.aliases ?? []).find((alias) => alias !== item.showName && scripts[item.drama]?.test(alias)) ?? "";
}

function toggleButton(button, active, on, off) {
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.textContent = active ? on : off;
}

function streamingShortcut(card, item) {
  const link = streamingLink(state.streamingService, item.showName);
  const find = card.querySelector(".stream-link");
  find.textContent = `Find on ${link.name}`;
  find.href = link.url;
  find.setAttribute("aria-label", `Find ${item.showName} on ${link.name} (opens a new tab)`);
  const official = officialShowLink(item.officialSite);
  const direct = card.querySelector(".official-link");
  if (official) {
    direct.href = official.url;
    direct.textContent = `Open ${official.name} show page`;
    direct.setAttribute("aria-label", `Open ${item.showName} on ${official.name} (opens a new tab)`);
  } else {
    direct.remove();
  }
}

function createCard(item) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  card.id = item.id;
  card.dataset.drama = item.drama;
  card.dataset.format = episodeFormat(item.runtime);
  const image = card.querySelector(".show-card__poster");
  if (item.image) {
    image.src = item.image;
    image.alt = `${item.showName} poster`;
    image.addEventListener("error", () => image.remove(), { once: true });
  } else image.remove();
  card.querySelector(".show-card__category").textContent = dramaFor(item)?.label;
  card.querySelector(".show-card__service").textContent = `Original release: ${item.service}`;
  const title = card.querySelector(".show-card__title a");
  title.textContent = item.showName;
  title.href = `#${item.id}`;
  card.querySelector(".show-card__native").textContent = nativeTitle(item);
  card.querySelector(".show-card__season").textContent =
    `Season ${item.season}${item.isSeriesFinale ? " / Series finale" : ""}`;
  card.querySelector(".show-card__episodes").textContent = plural(item.episodeCount, "episode");
  card.querySelector(".show-card__runtime").textContent = item.runtime ? `${item.runtime} min / ep` : "Not listed";
  card.querySelector(".show-card__genres").textContent = item.genres.join(" / ") || "Live-action series";
  card.querySelector(".show-card__length").textContent =
    episodeFormat(item.runtime) === "short" ? "Short drama" : item.runtime ? estimatedTime(item) : "Episode length unknown";
  const badge = card.querySelector(".show-card__badge");
  badge.textContent = state.view === "upcoming" ? relativeLabel(item) : "Binge-ready";
  badge.classList.toggle("show-card__badge--upcoming", state.view === "upcoming");

  const save = card.querySelector(".save-button");
  save.dataset.focus = `save-${item.id}`;
  toggleButton(save, state.saved.has(item.id), "Saved", "Save");
  save.setAttribute("aria-label", `${state.saved.has(item.id) ? "Unsave" : "Save"} ${item.showName}`);
  save.addEventListener("click", () => {
    if (state.saved.has(item.id)) {
      state.saved.delete(item.id);
      state.savedRecords.delete(item.id);
    } else {
      state.saved.add(item.id);
      state.savedRecords.set(item.id, item);
    }
    persist("saved", [...state.saved]);
    persist("saved-records", [...state.savedRecords.values()]);
    render();
  });
  const watched = card.querySelector(".watched-button");
  if (state.view === "ready") {
    watched.dataset.focus = `watched-${item.id}`;
    toggleButton(watched, state.watched.has(item.id), "Watched", "Mark watched");
    watched.setAttribute("aria-label", `${state.watched.has(item.id) ? "Mark unwatched" : "Mark watched"} ${item.showName}`);
    watched.addEventListener("click", () => {
      if (state.watched.has(item.id)) state.watched.delete(item.id);
      else state.watched.add(item.id);
      persist("watched", [...state.watched]);
      render();
    });
  } else watched.remove();
  const details = card.querySelector(".details-link");
  details.href = item.sourceUrl;
  details.setAttribute("aria-label", `Details for ${item.showName} on TVMaze (opens a new tab)`);
  streamingShortcut(card, item);
  return card;
}

function estimatedTime(item) {
  const hours = item.episodeCount * item.runtime / 60;
  return `About ${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours total`;
}

function syncControls() {
  for (const [attribute, value] of [["view", state.view], ["drama", state.drama], ["length", state.length], ["range", state.range]]) {
    document.querySelectorAll(`[data-${attribute}]`).forEach((button) => {
      if (button.tagName !== "BUTTON") return;
      const active = button.dataset[attribute] === value;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  elements.hideWatchedControl.hidden = state.view !== "ready";
  $("#length-note").textContent = state.length === "standard"
    ? "20+ min per episode, plus shows with unlisted runtimes."
    : state.length === "short" ? "Under 20 min per episode. No popularity cutoff." : "Every episode length. No popularity cutoff.";
}

function updateCounts() {
  const items = allItems().filter((item) =>
    matchesLength(item, state.length) && (!state.drama || item.drama === state.drama));
  const ready = items.filter(isReady).length;
  const upcoming = items.length - ready;
  elements.readyCount.textContent = `${ready.toLocaleString()} binge-ready / ${upcoming.toLocaleString()} coming up`;
  $("[data-view='ready']").textContent = `Binge-ready (${ready.toLocaleString()})`;
  $("[data-view='upcoming']").textContent = `Coming up (${upcoming.toLocaleString()})`;
  for (const drama of DRAMAS) {
    const count = allItems().filter((item) => item.drama === drama.id && matchesLength(item, state.length) && forTiming(item)).length;
    $(`[data-drama='${drama.id}'] .drama-count`).textContent = count.toLocaleString();
  }
}

function activeFilters() {
  return state.search || state.drama || state.length !== "standard" || state.range !== "30" ||
    state.genre || state.service || state.savedOnly || state.hideWatched;
}

function render() {
  if (!state.data) return;
  const focusKey = document.activeElement?.dataset.focus;
  const moreFocused = document.activeElement === elements.showMore;
  syncControls();
  updateCounts();
  const items = filteredItems();
  const visible = items.slice(0, state.limit);
  const groups = new Map();
  for (const item of visible) {
    if (!groups.has(item.finaleDate)) groups.set(item.finaleDate, []);
    groups.get(item.finaleDate).push(item);
  }
  const fragment = document.createDocumentFragment();
  for (const [date, records] of groups) {
    const section = document.createElement("section");
    section.className = "date-group";
    const heading = document.createElement("h2");
    heading.className = "date-group__heading";
    heading.append(dateLabel(date));
    const relative = document.createElement("span");
    relative.textContent = relativeLabel(records[0]);
    heading.append(relative);
    const grid = document.createElement("div");
    grid.className = "date-group__grid";
    grid.append(...records.map(createCard));
    section.append(heading, grid);
    fragment.append(section);
  }
  elements.feed.replaceChildren(fragment);
  elements.feed.hidden = items.length === 0;
  elements.emptyState.hidden = items.length > 0;
  elements.resultCount.textContent = `${plural(items.length, "season")} found${visible.length < items.length ? ` / Showing ${visible.length}` : ""}`;
  elements.clearFilters.hidden = !activeFilters();
  elements.showMore.hidden = visible.length >= items.length;
  elements.showMore.textContent = `Show ${Math.min(PAGE_SIZE, items.length - visible.length)} more`;
  if (focusKey) {
    const target = [...elements.feed.querySelectorAll("[data-focus]")].find((item) => item.dataset.focus === focusKey);
    (target ?? elements.resultCount).focus({ preventScroll: true });
  } else if (moreFocused && elements.showMore.hidden) {
    elements.resultCount.focus({ preventScroll: true });
  }
}

function changeFilters() {
  state.limit = PAGE_SIZE;
  render();
}

function clearFilters() {
  Object.assign(state, {
    drama: "", length: "standard", range: "30", search: "", genre: "", service: "",
    savedOnly: false, hideWatched: false, limit: PAGE_SIZE
  });
  elements.search.value = "";
  elements.genre.value = "";
  elements.service.value = "";
  elements.savedOnly.checked = false;
  elements.hideWatched.checked = false;
  persist("hide-watched", false);
  render();
}

function revealHash() {
  if (!state.data || !location.hash) return;
  const id = location.hash.slice(1);
  const target = allItems().find((item) => item.id === id);
  if (!target) return;
  Object.assign(state, {
    view: isReady(target) ? "ready" : "upcoming", drama: "", length: "all",
    range: "all", search: target.showName, genre: "", service: "", savedOnly: false,
    hideWatched: false, limit: Number.POSITIVE_INFINITY
  });
  elements.search.value = state.search;
  elements.genre.value = "";
  elements.service.value = "";
  elements.savedOnly.checked = false;
  elements.hideWatched.checked = false;
  render();
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
}

function setOptions(select, values) {
  select.replaceChildren(select.options[0]);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

async function loadData() {
  elements.errorState.hidden = true;
  try {
    const response = await fetch("data/finales.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    const data = await response.json();
    if (data.schemaVersion !== 3 || !Array.isArray(data.finales) || !Array.isArray(data.upcoming)) {
      throw new Error("Unrecognized drama dataset");
    }
    state.data = data;
    for (const item of [...data.finales, ...data.upcoming]) {
      if (state.saved.has(item.id)) state.savedRecords.set(item.id, item);
    }
    if (state.saved.size) persist("saved-records", [...state.savedRecords.values()]);
    setOptions(elements.genre, data.filters.genres);
    setOptions(elements.service, data.filters.services);
    elements.genre.value = state.genre;
    elements.service.value = state.service;
    elements.hideWatched.checked = state.hideWatched;
    elements.updatedAt.textContent = `Updated ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium", timeStyle: "short"
    }).format(new Date(data.generatedAt))}`;
    $("#stale-note").hidden = Date.now() - Date.parse(data.generatedAt) < 2 * DAY;
    render();
    revealHash();
  } catch (error) {
    console.error(error);
    elements.feed.hidden = true;
    elements.emptyState.hidden = true;
    elements.showMore.hidden = true;
    elements.errorState.hidden = false;
    elements.resultCount.textContent = "The drama list is unavailable.";
    elements.readyCount.textContent = "Could not load data";
    elements.updatedAt.textContent = "";
  }
}

function bindEvents() {
  for (const key of ["view", "drama", "length", "range"]) {
    document.querySelectorAll(`button[data-${key}]`).forEach((button) =>
      button.addEventListener("click", () => {
        state[key] = button.dataset[key];
        changeFilters();
      }));
  }
  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    if (state.search) state.range = "all";
    changeFilters();
  });
  for (const key of ["service", "genre"]) {
    elements[key].addEventListener("change", (event) => {
      state[key] = event.target.value;
      changeFilters();
    });
  }
  elements.savedOnly.addEventListener("change", (event) => {
    state.savedOnly = event.target.checked;
    if (state.savedOnly) state.range = "all";
    changeFilters();
  });
  elements.hideWatched.addEventListener("change", (event) => {
    state.hideWatched = event.target.checked;
    persist("hide-watched", state.hideWatched);
    changeFilters();
  });
  for (const service of STREAMING_SERVICES) {
    const option = document.createElement("option");
    option.value = service.id;
    option.textContent = service.name;
    elements.streaming.append(option);
  }
  elements.streaming.value = state.streamingService;
  $("#streaming-name").textContent = streamingLink(state.streamingService, "").name;
  elements.streaming.addEventListener("change", () => {
    state.streamingService = elements.streaming.value;
    persist("streaming-service", state.streamingService);
    $("#streaming-name").textContent = streamingLink(state.streamingService, "").name;
    render();
  });
  elements.clearFilters.addEventListener("click", clearFilters);
  $("[data-clear-filters]").addEventListener("click", clearFilters);
  $("[data-retry]").addEventListener("click", loadData);
  elements.showMore.addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    render();
  });
  window.addEventListener("hashchange", revealHash);
  window.addEventListener("online", () => { $("#offline-note").hidden = true; });
  window.addEventListener("offline", () => { $("#offline-note").hidden = false; });
  $("#offline-note").hidden = navigator.onLine;
}

bindEvents();
loadData();
let readiness = "";
setInterval(() => {
  if (!state.data) return;
  const current = `${today()}:${state.data.upcoming.filter(isReady).map((item) => item.id).join(",")}`;
  if (current !== readiness) {
    readiness = current;
    render();
  }
}, 60_000);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Offline caching unavailable", error));
}
