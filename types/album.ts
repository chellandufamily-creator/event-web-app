export type AlbumItem = {
  id: string;
  fileId: string;
  originalFilename: string;
  mimeType: string | null;
  uploaderName: string;
  /** Derived: camera originals use uploader `CameraMan` / `source` from Firestore. */
  source: "camera" | "upload";
  createdAt: string | null;
  kind: "image" | "video";
  thumbUrl: string;
  blurThumbUrl: string;
  viewUrl: string;
};
