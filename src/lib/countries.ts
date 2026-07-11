// ISO 3166-1 alpha-2 country codes. Names are resolved at runtime via
// Intl.DisplayNames so we don't hand-maintain a name table (and get the user's
// English labels for free). Used by the structured address inputs; phone uses
// react-phone-number-input's own country data.

export const COUNTRY_CODES = [
  "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ",
  "BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR",
  "IO","BN","BG","BF","BI","CV","KH","CM","CA","KY","CF","TD","CL","CN","CX","CC",
  "CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO",
  "EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","TF",
  "GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY",
  "HT","HM","VA","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM",
  "JP","JE","JO","KZ","KE","KI","KP","KR","KW","KG","LA","LV","LB","LS","LR","LY",
  "LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX",
  "FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI",
  "NE","NG","NU","NF","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH",
  "PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC","MF","PM","VC",
  "WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS",
  "SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK",
  "TO","TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU",
  "VE","VN","VG","VI","WF","EH","YE","ZM","ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const displayNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

// Options sorted by display name, for the country <Select>.
export const COUNTRY_OPTIONS: { code: CountryCode; name: string }[] = [...COUNTRY_CODES]
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Demonyms (the adjective form: "French", "American") for the nationality byline
// on tearsheets and artist bylines. Intl.DisplayNames only resolves country NAMES,
// not demonyms, so this is a hand-maintained lookup — a bounded reference table, not
// a judgment call. Covers the nationalities a Western art dealer actually encounters;
// anything not listed falls back to the country name via `demonym()`.
const DEMONYMS: Partial<Record<CountryCode, string>> = {
  AF: "Afghan", AL: "Albanian", DZ: "Algerian", AR: "Argentine", AM: "Armenian",
  AU: "Australian", AT: "Austrian", AZ: "Azerbaijani", BD: "Bangladeshi", BE: "Belgian",
  BO: "Bolivian", BA: "Bosnian", BR: "Brazilian", BG: "Bulgarian", KH: "Cambodian",
  CM: "Cameroonian", CA: "Canadian", CL: "Chilean", CN: "Chinese", CO: "Colombian",
  CR: "Costa Rican", HR: "Croatian", CU: "Cuban", CY: "Cypriot", CZ: "Czech",
  DK: "Danish", DO: "Dominican", EC: "Ecuadorian", EG: "Egyptian", SV: "Salvadoran",
  EE: "Estonian", ET: "Ethiopian", FI: "Finnish", FR: "French", GE: "Georgian",
  DE: "German", GH: "Ghanaian", GR: "Greek", GT: "Guatemalan", HT: "Haitian",
  HN: "Honduran", HK: "Hong Kong", HU: "Hungarian", IS: "Icelandic", IN: "Indian",
  ID: "Indonesian", IR: "Iranian", IQ: "Iraqi", IE: "Irish", IL: "Israeli",
  IT: "Italian", JM: "Jamaican", JP: "Japanese", JO: "Jordanian", KZ: "Kazakh",
  KE: "Kenyan", KP: "North Korean", KR: "South Korean", KW: "Kuwaiti", LV: "Latvian",
  LB: "Lebanese", LY: "Libyan", LT: "Lithuanian", LU: "Luxembourgish", MY: "Malaysian",
  ML: "Malian", MT: "Maltese", MX: "Mexican", MD: "Moldovan", MC: "Monégasque",
  MN: "Mongolian", ME: "Montenegrin", MA: "Moroccan", MM: "Burmese", NP: "Nepali",
  NL: "Dutch", NZ: "New Zealand", NI: "Nicaraguan", NG: "Nigerian", MK: "Macedonian",
  NO: "Norwegian", PK: "Pakistani", PS: "Palestinian", PA: "Panamanian", PY: "Paraguayan",
  PE: "Peruvian", PH: "Filipino", PL: "Polish", PT: "Portuguese", PR: "Puerto Rican",
  QA: "Qatari", RO: "Romanian", RU: "Russian", RW: "Rwandan", SA: "Saudi",
  RS: "Serbian", SG: "Singaporean", SK: "Slovak", SI: "Slovenian", ZA: "South African",
  ES: "Spanish", LK: "Sri Lankan", SD: "Sudanese", SE: "Swedish", CH: "Swiss",
  SY: "Syrian", TW: "Taiwanese", TH: "Thai", TN: "Tunisian", TR: "Turkish",
  UG: "Ugandan", UA: "Ukrainian", AE: "Emirati", GB: "British", US: "American",
  UY: "Uruguayan", UZ: "Uzbek", VE: "Venezuelan", VN: "Vietnamese", ZW: "Zimbabwean",
};

// The adjective form for a country ("French"), falling back to the country name
// ("Ivory Coast") when no demonym is on record.
export function demonym(code: string | null | undefined): string {
  if (!code) return "";
  return DEMONYMS[code as CountryCode] ?? countryName(code);
}

// The art-world nationality byline for an ordered list of country codes.
// Primary-first order is the caller's responsibility; joined with a hyphen:
// ["CU","US"] → "Cuban-American".
export function formatNationalities(codes: readonly string[] | null | undefined): string {
  if (!codes || codes.length === 0) return "";
  return codes.map(demonym).filter(Boolean).join("-");
}
