import { describe, expect, it } from "vitest";

import { buildUploadSessionFolderName, slugifyUploaderSegment } from "./upload-folder-name";

describe("upload-folder-name", () => {
  it("slugifies display name", () => {
    expect(slugifyUploaderSegment("Jane Doe!")).toBe("Jane_Doe");
    expect(slugifyUploaderSegment("   ")).toBe("uploader");
  });

  it("builds dated folder name", () => {
    const d = new Date("2026-04-02T12:00:00.000Z");
    // Dots/spaces collapse to single underscores; trailing punctuation is trimmed.
    expect(buildUploadSessionFolderName("Sam P.", d)).toBe("Sam_P_2026-04-02");
  });
});
