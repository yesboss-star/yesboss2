import { useGoogleStore } from "../stores/googleStore";
import { useZohoStore } from "../stores/zohoStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

/**
 * Choose the calendar API base for the user's connected provider.
 * Google takes precedence (either/or model â€” only one is connected at a time).
 */
export function getCalendarBase(): string {
  const google = useGoogleStore.getState();
  if (google.connected) {
    return `${API_URL}/google/calendar`;
  }
  const zoho = useZohoStore.getState();
  if (zoho.connected) {
    return `${API_URL}/zoho/calendar`;
  }
  return `${API_URL}/zoho/calendar`;
}

export { API_URL };
