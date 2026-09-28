// Stable per-browser device id — the backend binds the vault to the first device
// that unlocks and refuses others until you approve them in Settings.
const KEY = "professor.device_id";

export function deviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
