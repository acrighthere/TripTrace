// ISO 3166-1 alpha-2 (lowercase) -> continent. Used to derive a visit's
// continent from the country code returned by Nominatim, so the stats
// dashboard can count continents without another lookup. Transcontinental
// countries are assigned by the most common convention (e.g. Russia ->
// Europe, Turkey -> Asia); a missing code simply yields null (graceful).

const BY_CONTINENT: Record<string, string[]> = {
  Africa: [
    "dz", "ao", "bj", "bw", "bf", "bi", "cm", "cv", "cf", "td", "km", "cg", "cd",
    "ci", "dj", "eg", "gq", "er", "sz", "et", "ga", "gm", "gh", "gn", "gw", "ke",
    "ls", "lr", "ly", "mg", "mw", "ml", "mr", "mu", "yt", "ma", "mz", "na", "ne",
    "ng", "re", "rw", "sh", "st", "sn", "sc", "sl", "so", "za", "ss", "sd", "tz",
    "tg", "tn", "ug", "eh", "zm", "zw",
  ],
  Asia: [
    "af", "am", "az", "bh", "bd", "bt", "bn", "kh", "cn", "ge", "hk", "in", "id",
    "ir", "iq", "il", "jp", "jo", "kz", "kp", "kr", "kw", "kg", "la", "lb", "mo",
    "my", "mv", "mn", "mm", "np", "om", "pk", "ps", "ph", "qa", "sa", "sg", "lk",
    "sy", "tw", "tj", "th", "tl", "tr", "tm", "ae", "uz", "vn", "ye",
  ],
  Europe: [
    "al", "ad", "at", "by", "be", "ba", "bg", "hr", "cy", "cz", "dk", "ee", "fo",
    "fi", "fr", "de", "gi", "gr", "gg", "hu", "is", "ie", "im", "it", "je", "lv",
    "li", "lt", "lu", "mt", "md", "mc", "me", "nl", "mk", "no", "pl", "pt", "ro",
    "ru", "sm", "rs", "sk", "si", "es", "se", "ch", "ua", "gb", "va", "ax",
  ],
  "North America": [
    "ai", "ag", "aw", "bs", "bb", "bz", "bm", "vg", "ca", "ky", "cr", "cu", "cw",
    "dm", "do", "sv", "gl", "gd", "gp", "gt", "ht", "hn", "jm", "mq", "mx", "ms",
    "ni", "pa", "pr", "bl", "kn", "lc", "mf", "pm", "vc", "sx", "tt", "tc", "us",
    "vi", "bq",
  ],
  "South America": [
    "ar", "bo", "br", "cl", "co", "ec", "fk", "gf", "gy", "py", "pe", "sr", "uy", "ve",
  ],
  Oceania: [
    "as", "au", "ck", "fj", "pf", "gu", "ki", "mh", "fm", "nr", "nc", "nz", "nu",
    "nf", "mp", "pw", "pg", "pn", "ws", "sb", "tk", "to", "tv", "vu", "wf",
  ],
  Antarctica: ["aq", "bv", "gs", "tf", "hm"],
};

const CODE_TO_CONTINENT: Record<string, string> = {};
for (const [continent, codes] of Object.entries(BY_CONTINENT)) {
  for (const code of codes) CODE_TO_CONTINENT[code] = continent;
}

export function continentForCode(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  return CODE_TO_CONTINENT[countryCode.toLowerCase()] ?? null;
}
