/** Turns one typed line into a task: "Review the sprint plan Friday @Bob high".
 *
 *  It only reads what is clearly there. A date, an @person and a priority are taken out of the line when they are
 *  recognised; everything else stays in the title. A name that matches nobody (or more than one person) is never
 *  guessed: the task is left unassigned and `note` says why. Assigning notifies the person, so a wrong guess matters. */

export type Priority = "urgent" | "high" | "medium" | "low";
export interface QuickMember {
  email: string;
  full_name: string;
}
export interface QuickTask {
  title: string;
  /** yyyy-mm-dd in the viewer's own calendar, or null */
  dueDate: string | null;
  /** the date as typed ("Friday", "20 Nov"), for showing back to the person */
  dueText: string | null;
  priority: Priority | null;
  assignee: { email: string; name: string } | null;
  /** why an @name was not used, or null */
  note: string | null;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sept: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

const MONTH_RE = Object.keys(MONTHS).join("|");
const WEEKDAY_RE = Object.keys(WEEKDAYS).join("|");
const LEAD_IN = "(?:(?:by|on|due|before|until|till)\\s+)?";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A real calendar date, or null (so "31/02" is not a date). */
function realDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
}

/** A day and month with no year means the next time that day comes round. */
function nextOccurrence(month: number, day: number, today: Date): Date | null {
  const thisYear = realDate(today.getFullYear(), month, day);
  if (thisYear && thisYear >= today) return thisYear;
  return realDate(today.getFullYear() + 1, month, day);
}

interface Found {
  date: Date;
  start: number;
  end: number;
  text: string;
}

/** The first date phrase in the line, with the "by"/"on"/"due" in front of it. */
function findDate(line: string, today: Date): Found | null {
  const tries: { re: RegExp; toDate: (m: RegExpExecArray) => Date | null }[] = [
    { re: new RegExp(`${LEAD_IN}\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`, "i"), toDate: (m) => realDate(+m[1], +m[2] - 1, +m[3]) },
    // 20/11 or 20/11/2026; 20-11-2026 and 20.11.2026 only with a year, so "3-4 docs" and "v1.2" are left alone
    {
      re: new RegExp(`${LEAD_IN}\\b(\\d{1,2})([/.-])(\\d{1,2})(?:[/.-](\\d{2,4}))?\\b`, "i"),
      toDate: (m) => {
        const [day, sep, month, year] = [+m[1], m[2], +m[3], m[4]];
        if (!year && sep !== "/") return null;
        if (month < 1 || month > 12) return null;
        if (!year) return nextOccurrence(month - 1, day, today);
        return realDate(year.length === 2 ? 2000 + +year : +year, month - 1, day);
      },
    },
    {
      re: new RegExp(`${LEAD_IN}\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b`, "i"),
      toDate: (m) => nextOccurrence(MONTHS[m[2].toLowerCase()], +m[1], today),
    },
    {
      re: new RegExp(`${LEAD_IN}\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"),
      toDate: (m) => nextOccurrence(MONTHS[m[1].toLowerCase()], +m[2], today),
    },
    {
      re: /\bin\s+(\d{1,3})\s+(day|days|week|weeks)\b/i,
      toDate: (m) => addDays(today, +m[1] * (m[2].toLowerCase().startsWith("week") ? 7 : 1)),
    },
    { re: new RegExp(`${LEAD_IN}\\bnext\\s+week\\b`, "i"), toDate: () => addDays(today, ((8 - today.getDay()) % 7) || 7) }, // the coming Monday
    {
      re: new RegExp(`${LEAD_IN}\\b(today|tonight|eod|tomorrow|tmrw)\\b`, "i"),
      toDate: (m) => (/^(tomorrow|tmrw)$/i.test(m[1]) ? addDays(today, 1) : today),
    },
    {
      re: new RegExp(`${LEAD_IN}\\b(?:(next|this)\\s+)?(${WEEKDAY_RE})\\b`, "i"),
      toDate: (m) => {
        const target = WEEKDAYS[m[2].toLowerCase()];
        let ahead = (target - today.getDay() + 7) % 7; // the same weekday means today
        if (m[1]?.toLowerCase() === "next" && ahead < 7) ahead += 7;
        return addDays(today, ahead);
      },
    },
  ];
  for (const { re, toDate } of tries) {
    const match = re.exec(line);
    if (!match) continue;
    const date = toDate(match);
    if (date) return { date, start: match.index, end: match.index + match[0].length, text: match[0].replace(new RegExp(`^${LEAD_IN}`, "i"), "").trim() };
  }
  return null;
}

const words = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const localPart = (email: string) => email.toLowerCase().split("@")[0];

/** Who an @name could mean: a whole name, a first or last name, or the start of one. */
function matchMembers(query: string, members: QuickMember[]): QuickMember[] {
  const q = query.toLowerCase();
  const exact = members.filter((m) => m.full_name.toLowerCase() === q || localPart(m.email) === q);
  if (exact.length === 1) return exact;
  const byWord = members.filter((m) => words(m.full_name).includes(q));
  if (byWord.length) return byWord;
  return members.filter((m) => m.full_name.toLowerCase().startsWith(q) || words(m.full_name).some((w) => w.startsWith(q)) || localPart(m.email).startsWith(q));
}

const trimEdges = (s: string) => s.replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "");

export function parseQuickTask(input: string, members: QuickMember[], now: Date = new Date()): QuickTask {
  const today = startOfDay(now);
  let line = ` ${input} `;
  const out: QuickTask = { title: "", dueDate: null, dueText: null, priority: null, assignee: null, note: null };

  // 1. @person (a single name, or two words when together they pick exactly one person)
  const mention = /(^|\s)@([\p{L}][\p{L}.'-]*)(?:\s+([\p{L}][\p{L}'-]*))?/u.exec(line);
  if (mention) {
    const [whole, lead, first, second] = mention;
    let consumed = whole;
    let hits = matchMembers(first, members);
    if (second) {
      const both = matchMembers(`${first} ${second}`, members);
      if (both.length === 1) {
        hits = both;
      } else {
        consumed = whole.slice(0, whole.length - second.length - 1); // the second word is part of the title
      }
    }
    if (hits.length === 1) out.assignee = { email: hits[0].email, name: hits[0].full_name };
    else if (hits.length === 0) out.note = `No one matches @${first}, so it stays unassigned.`;
    else out.note = `${hits.length} people match @${first}. Use more of the name.`;
    line = line.replace(consumed, lead || " ");
  }

  // 2. the date
  const found = findDate(line, today);
  if (found) {
    out.dueDate = iso(found.date);
    out.dueText = found.text;
    line = `${line.slice(0, found.start)} ${line.slice(found.end)}`;
  }

  // 3. the priority: "high priority" / "!high" anywhere, or a lone word at the very end ("... Friday high")
  const named = new RegExp(`(?:\\b(${PRIORITIES.join("|")})\\s+priority\\b|\\bpriority\\s*[:=]?\\s*(${PRIORITIES.join("|")})\\b|(?:^|\\s)!(${PRIORITIES.join("|")})\\b)`, "i").exec(line);
  if (named) {
    out.priority = (named[1] || named[2] || named[3]).toLowerCase() as Priority;
    line = line.replace(named[0], " ");
  } else {
    const tail = new RegExp(`\\s(${PRIORITIES.join("|")}|asap)[.!]?\\s*$`, "i").exec(line.trimEnd() + " ");
    const before = tail ? line.slice(0, line.lastIndexOf(tail[1])).trim() : "";
    if (tail && before) {
      const word = tail[1].toLowerCase();
      out.priority = word === "asap" ? "urgent" : (word as Priority);
      line = before;
    }
  }

  // 4. what is left is the title (without a dangling "by" or "for")
  let title = trimEdges(line.replace(/\s+/g, " "));
  title = trimEdges(title.replace(/\s+(?:by|on|for|to|before|until|due)$/i, ""));
  out.title = title.length >= 2 ? title.charAt(0).toUpperCase() + title.slice(1) : "";
  return out;
}

/** "Fri 20 Nov" */
export function formatDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
