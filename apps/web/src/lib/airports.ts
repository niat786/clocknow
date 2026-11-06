// IATA airport (and a few metro) codes → IANA zone, for search-box answers like "15:30 lhr in nrt".
// Typed by hand from public IATA codes; the zone of the airport's city. Checked against Intl in the test.
const RAW: Record<string, string> = {
  // North America
  ATL: 'America/New_York', JFK: 'America/New_York', EWR: 'America/New_York', LGA: 'America/New_York', NYC: 'America/New_York',
  BOS: 'America/New_York', PHL: 'America/New_York', IAD: 'America/New_York', DCA: 'America/New_York', WAS: 'America/New_York',
  CLT: 'America/New_York', MIA: 'America/New_York', MCO: 'America/New_York', TPA: 'America/New_York', FLL: 'America/New_York',
  DTW: 'America/Detroit', ORD: 'America/Chicago', MDW: 'America/Chicago', CHI: 'America/Chicago', DFW: 'America/Chicago',
  IAH: 'America/Chicago', HOU: 'America/Chicago', AUS: 'America/Chicago', MSP: 'America/Chicago', STL: 'America/Chicago',
  MCI: 'America/Chicago', MSY: 'America/Chicago', BNA: 'America/Chicago', DEN: 'America/Denver', SLC: 'America/Denver',
  PHX: 'America/Phoenix', LAS: 'America/Los_Angeles', LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles',
  SJC: 'America/Los_Angeles', SAN: 'America/Los_Angeles', SEA: 'America/Los_Angeles', PDX: 'America/Los_Angeles',
  ANC: 'America/Anchorage', HNL: 'Pacific/Honolulu', YYZ: 'America/Toronto', YUL: 'America/Toronto', YOW: 'America/Toronto',
  YVR: 'America/Vancouver', YYC: 'America/Edmonton', MEX: 'America/Mexico_City', CUN: 'America/Cancun',
  PTY: 'America/Panama', SJU: 'America/Puerto_Rico',
  // South America
  GRU: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo', SAO: 'America/Sao_Paulo', EZE: 'America/Argentina/Buenos_Aires',
  SCL: 'America/Santiago', LIM: 'America/Lima', BOG: 'America/Bogota', UIO: 'America/Guayaquil', CCS: 'America/Caracas',
  MVD: 'America/Montevideo',
  // Europe
  LHR: 'Europe/London', LGW: 'Europe/London', STN: 'Europe/London', LTN: 'Europe/London', LON: 'Europe/London',
  MAN: 'Europe/London', EDI: 'Europe/London', DUB: 'Europe/Dublin', CDG: 'Europe/Paris', ORY: 'Europe/Paris',
  PAR: 'Europe/Paris', AMS: 'Europe/Amsterdam', BRU: 'Europe/Brussels', FRA: 'Europe/Berlin', MUC: 'Europe/Berlin',
  BER: 'Europe/Berlin', DUS: 'Europe/Berlin', HAM: 'Europe/Berlin', ZRH: 'Europe/Zurich', GVA: 'Europe/Zurich',
  VIE: 'Europe/Vienna', MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', LIS: 'Europe/Lisbon', OPO: 'Europe/Lisbon',
  FCO: 'Europe/Rome', MXP: 'Europe/Rome', ROM: 'Europe/Rome', MIL: 'Europe/Rome', ATH: 'Europe/Athens',
  IST: 'Europe/Istanbul', SAW: 'Europe/Istanbul', CPH: 'Europe/Copenhagen', ARN: 'Europe/Stockholm', OSL: 'Europe/Oslo',
  HEL: 'Europe/Helsinki', WAW: 'Europe/Warsaw', PRG: 'Europe/Prague', BUD: 'Europe/Budapest', OTP: 'Europe/Bucharest',
  SOF: 'Europe/Sofia', KEF: 'Atlantic/Reykjavik', SVO: 'Europe/Moscow', DME: 'Europe/Moscow', VKO: 'Europe/Moscow',
  MOW: 'Europe/Moscow', LED: 'Europe/Moscow', KBP: 'Europe/Kyiv',
  // Middle East and Africa
  DXB: 'Asia/Dubai', AUH: 'Asia/Dubai', DOH: 'Asia/Qatar', BAH: 'Asia/Bahrain', KWI: 'Asia/Kuwait', RUH: 'Asia/Riyadh',
  JED: 'Asia/Riyadh', DMM: 'Asia/Riyadh', MCT: 'Asia/Muscat', AMM: 'Asia/Amman', BEY: 'Asia/Beirut', TLV: 'Asia/Jerusalem',
  CAI: 'Africa/Cairo', IKA: 'Asia/Tehran', THR: 'Asia/Tehran', BGW: 'Asia/Baghdad', JNB: 'Africa/Johannesburg',
  CPT: 'Africa/Johannesburg', NBO: 'Africa/Nairobi', ADD: 'Africa/Addis_Ababa', LOS: 'Africa/Lagos', ACC: 'Africa/Accra',
  CMN: 'Africa/Casablanca', ALG: 'Africa/Algiers', TUN: 'Africa/Tunis', DAR: 'Africa/Dar_es_Salaam', EBB: 'Africa/Kampala',
  KGL: 'Africa/Kigali', MRU: 'Indian/Mauritius',
  // South and Central Asia
  KHI: 'Asia/Karachi', LHE: 'Asia/Karachi', ISB: 'Asia/Karachi', PEW: 'Asia/Karachi', MUX: 'Asia/Karachi',
  DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata', BLR: 'Asia/Kolkata', MAA: 'Asia/Kolkata', CCU: 'Asia/Kolkata',
  HYD: 'Asia/Kolkata', COK: 'Asia/Kolkata', AMD: 'Asia/Kolkata', DAC: 'Asia/Dhaka', CMB: 'Asia/Colombo',
  KTM: 'Asia/Kathmandu', MLE: 'Indian/Maldives', KBL: 'Asia/Kabul', TAS: 'Asia/Tashkent', ALA: 'Asia/Almaty',
  // East and Southeast Asia
  PEK: 'Asia/Shanghai', PKX: 'Asia/Shanghai', BJS: 'Asia/Shanghai', PVG: 'Asia/Shanghai', SHA: 'Asia/Shanghai',
  CAN: 'Asia/Shanghai', SZX: 'Asia/Shanghai', CTU: 'Asia/Shanghai', HKG: 'Asia/Hong_Kong', MFM: 'Asia/Macau',
  TPE: 'Asia/Taipei', NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', TYO: 'Asia/Tokyo', KIX: 'Asia/Tokyo', ITM: 'Asia/Tokyo',
  OSA: 'Asia/Tokyo', ICN: 'Asia/Seoul', GMP: 'Asia/Seoul', SEL: 'Asia/Seoul', SIN: 'Asia/Singapore',
  KUL: 'Asia/Kuala_Lumpur', BKK: 'Asia/Bangkok', DMK: 'Asia/Bangkok', HKT: 'Asia/Bangkok', CGK: 'Asia/Jakarta',
  DPS: 'Asia/Makassar', MNL: 'Asia/Manila', SGN: 'Asia/Ho_Chi_Minh', HAN: 'Asia/Ho_Chi_Minh', RGN: 'Asia/Yangon',
  PNH: 'Asia/Phnom_Penh', ULN: 'Asia/Ulaanbaatar',
  // Oceania
  SYD: 'Australia/Sydney', MEL: 'Australia/Melbourne', BNE: 'Australia/Brisbane', PER: 'Australia/Perth',
  ADL: 'Australia/Adelaide', CBR: 'Australia/Sydney', AKL: 'Pacific/Auckland', WLG: 'Pacific/Auckland',
  CHC: 'Pacific/Auckland', NAN: 'Pacific/Fiji', POM: 'Pacific/Port_Moresby', PPT: 'Pacific/Tahiti', GUM: 'Pacific/Guam',
};

export const AIRPORTS: Readonly<Record<string, string>> = RAW;

/** IANA zone for a three-letter code (any case), or null. */
export function airportZone(code: string): string | null {
  const c = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? (Object.hasOwn(AIRPORTS, c) ? (AIRPORTS[c] ?? null) : null) : null;
}
