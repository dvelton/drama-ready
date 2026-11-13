export const DRAMAS = [
  { id: "korean", label: "K-drama", languages: ["Korean"] },
  { id: "chinese", label: "C-drama", languages: ["Chinese", "Mandarin", "Cantonese", "Hokkien", "Min Nan"] },
  { id: "japanese", label: "J-drama", languages: ["Japanese"] }
];

export const STREAMING_SERVICES = [
  { id: "viki", name: "Viki", url: "https://www.viki.com/search", parameter: "q" },
  { id: "iqiyi", name: "iQIYI", url: "https://www.iq.com/search", parameter: "query" },
  { id: "wetv", name: "WeTV", url: "https://wetv.vip/en/search", parameter: "q" },
  { id: "netflix", name: "Netflix", url: "https://www.netflix.com/search", parameter: "q" },
  { id: "justwatch", name: "JustWatch (US)", url: "https://www.justwatch.com/us/search", parameter: "q" }
];

export function dramaFor(item) {
  if (item?.type !== "Scripted") return null;
  return DRAMAS.find((drama) => drama.languages.includes(item.language)) ?? null;
}

export function episodeFormat(runtime) {
  return Number.isFinite(runtime) && runtime > 0
    ? runtime < 20 ? "short" : "standard"
    : "unknown";
}

export function matchesLength(item, length) {
  const format = episodeFormat(item.runtime);
  return length === "all" || format === length || (length === "standard" && format === "unknown");
}

export function searchText(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

export function matchesSearch(item, query) {
  const haystack = searchText([
    item.showName, ...(item.aliases ?? []), item.service, item.language,
    dramaFor(item)?.label ?? "", ...item.genres
  ].join(" "));
  return searchText(query).split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}

export function streamingLink(serviceId, title) {
  const service = STREAMING_SERVICES.find((item) => item.id === serviceId) ?? STREAMING_SERVICES[0];
  const url = new URL(service.url);
  url.searchParams.set(service.parameter, title);
  return { name: service.name, url: url.href };
}

export function officialShowLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hosts = [
      ["viki.com", "Viki"], ["iq.com", "iQIYI"], ["iqiyi.com", "iQIYI"],
      ["wetv.vip", "WeTV"], ["netflix.com", "Netflix"], ["kocowa.com", "KOCOWA"],
      ["gagaoolala.com", "GagaOOLala"], ["youku.tv", "Youku"], ["youku.com", "Youku"],
      ["viu.com", "Viu"], ["disneyplus.com", "Disney+"], ["hulu.com", "Hulu"],
      ["primevideo.com", "Prime Video"], ["mgtv.com", "Mango TV"]
    ];
    const match = hosts.find(([host]) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (!match || url.pathname === "/") return null;
    return { name: match[1], url: url.href };
  } catch {
    return null;
  }
}
