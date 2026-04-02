import type { AlbumItem } from "@/types/album";

export type AlbumPageResponse = {
  items: AlbumItem[];
  /** Pass as `cursor` on the next request; Firestore doc id of last scanned row. */
  nextCursor: string | null;
  hasMore: boolean;
};
