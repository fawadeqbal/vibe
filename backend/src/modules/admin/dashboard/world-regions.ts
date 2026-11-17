/**
 * Eight world regions for admin → Marketing insights, by ISO 3166-1 alpha-2
 * country code (what Cloudflare's CF-IPCountry gives). Central America and the
 * Caribbean count as North America, North Africa as Africa, Central Asia and
 * Russia as Europe, and the Pacific islands as Oceania.
 */
export const WORLD_REGIONS = [
  'South Asia',
  'Middle East',
  'Africa',
  'Europe',
  'North America',
  'East Asia & Pacific',
  'South America',
  'Oceania',
] as const;
export type WorldRegion = (typeof WORLD_REGIONS)[number] | 'Unknown';

const CODES: Record<(typeof WORLD_REGIONS)[number], string> = {
  'South Asia': 'AF BD BT IN LK MV NP PK',
  'Middle East': 'AE BH IL IQ IR JO KW LB OM PS QA SA SY TR YE',
  Africa:
    'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
  Europe:
    'AD AL AM AT AX AZ BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GE GG GI GR HR HU IE IM IS IT JE KG KZ LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TJ TM UA UZ VA XK',
  'North America':
    'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
  'East Asia & Pacific': 'BN CN HK ID JP KH KP KR LA MM MN MO MY PH SG TH TL TW VN',
  'South America': 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE',
  Oceania: 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS',
};

const BY_CODE = new Map<string, WorldRegion>(
  Object.entries(CODES).flatMap(([region, codes]) => codes.split(' ').map((c) => [c, region as WorldRegion])),
);

/** The world region of a country code; 'Unknown' when there's no code or it isn't a country. */
export const worldRegion = (code: string | null | undefined): WorldRegion =>
  code ? (BY_CODE.get(code.toUpperCase()) ?? 'Unknown') : 'Unknown';
