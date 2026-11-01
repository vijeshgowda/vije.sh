/** Same normalisation as the original client: letters and digits only, upper case. */
export function cleanCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isValidCode(code: string): boolean {
  return code.length >= 4 && code.length <= 10;
}

/** The join code from a share link (`/lab/omni#K7Q2M9`), or "" if the hash isn't a valid code. */
export function codeFromHash(hash: string): string {
  let raw = hash.replace(/^#/, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return "";
  }
  const code = cleanCode(raw.trim());
  return isValidCode(code) ? code : "";
}
