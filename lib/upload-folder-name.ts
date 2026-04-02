/** Safe segment for Drive folder name: `name_YYYY-MM-DD`. */
export function slugifyUploaderSegment(displayName: string): string {
  const s = displayName
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || "uploader";
}

export function buildUploadSessionFolderName(displayName: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return `${slugifyUploaderSegment(displayName)}_${day}`;
}
