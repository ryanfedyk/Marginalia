/** Time zones south of the equator, by prefix. Good enough to flip the seasons. */
const SOUTHERN = [
  "Australia/", "Pacific/Auckland", "Pacific/Chatham", "Pacific/Fiji", "Pacific/Tongatapu", "Pacific/Port_Moresby",
  "America/Argentina", "America/Santiago", "America/Montevideo", "America/Asuncion", "America/Sao_Paulo", "America/La_Paz", "America/Lima",
  "Africa/Johannesburg", "Africa/Maputo", "Africa/Harare", "Africa/Lusaka", "Africa/Windhoek", "Africa/Gaborone", "Africa/Maseru", "Africa/Mbabane",
  "Indian/Antananarivo", "Indian/Mauritius", "Indian/Reunion",
];

export type Season = "spring" | "summer" | "autumn" | "winter";

export function seasonFor(date: Date, timeZone?: string): Season {
  const m = date.getMonth(); // 0 = Jan
  const north: Season = m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
  const southern = timeZone ? SOUTHERN.some((p) => timeZone.startsWith(p)) : false;
  if (!southern) return north;
  return ({ winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" } as const)[north];
}

/** "Friday 17 October 2026" plus the local season, from the browser's clock and time zone. */
export function todayContext(now = new Date()): { today: string; season: Season; month: string } {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return { today, season: seasonFor(now, tz), month: `${now.getFullYear()}-${now.getMonth() + 1}` };
}
