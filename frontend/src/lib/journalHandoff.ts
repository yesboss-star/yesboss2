/** Carries a personal message from Let's Talk to the Journal page. It goes into the Journal's text box and nothing is
 *  sent or saved until the person presses send there. Kept in sessionStorage so it lives only for this browser tab. */
const KEY = "yesboss-journal-handoff";

export function handOffToJournal(text: string) {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    /* private mode: the Journal simply opens empty */
  }
}

export function readJournalHandoff(): string {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function clearJournalHandoff() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
