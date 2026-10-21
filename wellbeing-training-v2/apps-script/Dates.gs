/**
 * Calendar helpers (rule R8): a cycle is 6 working days, Monday to Saturday, skipping school holidays.
 * Dates are yyyy-MM-dd text; everything is computed in UTC so the time zone never shifts a day.
 */

function isoToUtc_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}
const utcToIso_ = d => d.toISOString().slice(0, 10);
const nextDay_ = d => new Date(d.getTime() + 86400000);

/** Turns whatever is in a date cell into yyyy-MM-dd, or '' if unreadable. d/m/y is read day-first. */
function normaliseDate_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (/^\d{5}$/.test(s)) { const n = Number(s); return n > 20000 && n < 80000 ? utcToIso_(new Date(Math.round((n - 25569) * 86400000))) : ''; }
  let y, mo, da, m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T ])/.exec(s);
  if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  else if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) { da = +m[1]; mo = +m[2]; y = +m[3]; }
  else return '';
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (isNaN(dt.getTime()) || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return '';
  return utcToIso_(dt);
}

function holidaySet_(holidays) { const h = {}; (holidays || []).forEach(x => { const i = normaliseDate_(x); if (i) h[i] = true; }); return h; }
const isWorkingDay_ = (d, hol) => d.getUTCDay() !== 0 && !hol[utcToIso_(d)];

/** [{cycle, start, end}, ...]. A start date that is not a working day moves to the next one. */
function buildCalendar_(startIso, cycles, perCycle, holidays) {
  let d = isoToUtc_(startIso);
  if (!d) return [];
  const hol = holidaySet_(holidays), out = [];
  for (let c = 1; c <= cycles; c++) {
    let first = null, last = null;
    for (let i = 0; i < perCycle; i++) {
      while (!isWorkingDay_(d, hol)) d = nextDay_(d);
      if (i === 0) first = d;
      last = d; d = nextDay_(d);
    }
    out.push({ cycle: c, start: utcToIso_(first), end: utcToIso_(last) });
  }
  return out;
}

/** The cycle number containing a date: 0 before the start, cal.length + 1 after the end. */
function cycleOf_(cal, iso) {
  if (!cal.length || iso < cal[0].start) return 0;
  for (let i = 0; i < cal.length; i++) {
    if (iso <= cal[i].end) return iso >= cal[i].start ? cal[i].cycle : Math.max(1, cal[i].cycle - 1);
  }
  return cal.length + 1;
}

/** Working days after fromIso up to and including toIso. Negative when toIso is earlier. */
function workingDaysBetween_(fromIso, toIso, holidays) {
  const a = isoToUtc_(fromIso), b = isoToUtc_(toIso), hol = holidaySet_(holidays);
  if (!a || !b) return 0;
  if (b < a) return -workingDaysBetween_(toIso, fromIso, holidays);
  let n = 0;
  for (let d = nextDay_(a); d <= b; d = nextDay_(d)) if (isWorkingDay_(d, hol)) n++;
  return n;
}
