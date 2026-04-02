import type { drive_v3 } from "googleapis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DrivePolicyError,
  createFolder,
  deleteFile,
  ensureDriveLayoutOnStartup,
  listCameraRollWithAttribution,
  listFiles,
  moveFile,
  promoteToAlbum,
  resetGoogleDriveModuleStateForTests,
  setGoogleDriveClientForTests,
  uploadFile,
} from "./googleDrive";

function buildMockDrive(files: {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}): drive_v3.Drive {
  return { files } as unknown as drive_v3.Drive;
}

describe("googleDrive service (mock Drive client)", () => {
  const list = vi.fn();
  const create = vi.fn();
  const get = vi.fn();
  const update = vi.fn();
  const del = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetGoogleDriveModuleStateForTests();
    process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "test-refresh";
    process.env.ROOT_FOLDER_NAME = "EventRoot";
    delete process.env.GOOGLE_DRIVE_CAMERA_FOLDER_ID;
    delete process.env.GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS;
    setGoogleDriveClientForTests(buildMockDrive({ list, create, get, update, delete: del }));
  });

  afterEach(() => {
    resetGoogleDriveModuleStateForTests();
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    delete process.env.ROOT_FOLDER_NAME;
    delete process.env.GOOGLE_DRIVE_CAMERA_FOLDER_ID;
    delete process.env.GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS;
  });

  it("createFolder calls Drive files.create with folder mime type", async () => {
    create.mockResolvedValueOnce({ data: { id: "f1", name: "Sub" } });
    const out = await createFolder("Sub", "parent-xyz");
    expect(out).toEqual({ id: "f1", name: "Sub" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "Sub",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["parent-xyz"],
        }),
      })
    );
  });

  it("createFolder rejects immutable parent", async () => {
    process.env.GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS = "frozen";
    await expect(createFolder("x", "frozen")).rejects.toThrow(DrivePolicyError);
    expect(create).not.toHaveBeenCalled();
  });

  it("uploadFile streams buffer into media body", async () => {
    create.mockResolvedValueOnce({
      data: { id: "file1", name: "a.txt", mimeType: "text/plain", size: "3" },
    });
    const buf = Buffer.from("abc");
    const out = await uploadFile({ buffer: buf, filename: "a.txt", mimeType: "text/plain" }, "folder-1");
    expect(out.id).toBe("file1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { name: "a.txt", parents: ["folder-1"] },
        media: expect.objectContaining({ mimeType: "text/plain" }),
      })
    );
  });

  it("moveFile loads parents then updates with add/removeParents", async () => {
    get.mockResolvedValueOnce({ data: { parents: ["old-parent"] } });
    update.mockResolvedValueOnce({ data: { id: "x", parents: ["new-parent"] } });
    await moveFile("file-id", "new-parent");
    expect(get).toHaveBeenCalledWith({ fileId: "file-id", fields: "parents" });
    expect(update).toHaveBeenCalledWith({
      fileId: "file-id",
      addParents: "new-parent",
      removeParents: "old-parent",
      fields: "id, parents",
    });
  });

  it("moveFile rejects when source is under immutable folder", async () => {
    process.env.GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS = "cam";
    get.mockResolvedValueOnce({ data: { parents: ["cam"] } });
    await expect(moveFile("file-id", "elsewhere")).rejects.toThrow(DrivePolicyError);
    expect(update).not.toHaveBeenCalled();
  });

  it("deleteFile loads parents then deletes when allowed", async () => {
    get.mockResolvedValueOnce({ data: { parents: ["writable"] } });
    del.mockResolvedValueOnce({});
    await deleteFile("to-delete");
    expect(del).toHaveBeenCalledWith({ fileId: "to-delete" });
  });

  it("deleteFile rejects files in immutable folder", async () => {
    process.env.GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS = "frozen";
    get.mockResolvedValueOnce({ data: { parents: ["frozen"] } });
    await expect(deleteFile("protected")).rejects.toThrow(DrivePolicyError);
    expect(del).not.toHaveBeenCalled();
  });

  it("listFiles queries children of folderId", async () => {
    list.mockResolvedValueOnce({
      data: {
        files: [{ id: "1", name: "a", mimeType: "text/plain" }],
      },
    });
    const files = await listFiles("folder-z");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("a");
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "'folder-z' in parents and trashed=false",
      })
    );
  });

  it("listCameraRollWithAttribution tags CameraMan", async () => {
    list.mockResolvedValueOnce({
      data: { files: [{ id: "1", name: "a.jpg", mimeType: "image/jpeg" }] },
    });
    const files = await listCameraRollWithAttribution("cam-folder");
    expect(files[0]).toMatchObject({
      id: "1",
      name: "a.jpg",
      uploadedBy: "CameraMan",
      source: "camera",
    });
  });

  it("promoteToAlbum creates shortcut from camera folder", async () => {
    process.env.GOOGLE_DRIVE_CAMERA_FOLDER_ID = "cam";
    process.env.GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS = "cam";
    get
      .mockResolvedValueOnce({
        data: { id: "f1", name: "pic.jpg", mimeType: "image/jpeg", parents: ["cam"] },
      })
      .mockResolvedValueOnce({ data: { parents: ["cam"] } });
    create.mockResolvedValueOnce({ data: { id: "sc1", name: "pic.jpg" } });
    const r = await promoteToAlbum("f1", {
      albumFolderId: "alb",
      uploadsFolderId: "up",
      cameraFolderId: "cam",
    });
    expect(r).toEqual({ kind: "shortcut", shortcutId: "sc1", targetFileId: "f1" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: "f1" },
          parents: ["alb"],
        }),
      })
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("promoteToAlbum moves file from uploads folder", async () => {
    get
      .mockResolvedValueOnce({
        data: { id: "f2", name: "user.jpg", mimeType: "image/jpeg", parents: ["up"] },
      })
      .mockResolvedValueOnce({ data: { parents: ["up"] } })
      .mockResolvedValueOnce({ data: { parents: ["up"] } });
    update.mockResolvedValueOnce({ data: {} });
    const r = await promoteToAlbum("f2", {
      albumFolderId: "alb",
      uploadsFolderId: "up",
      cameraFolderId: null,
    });
    expect(r).toEqual({ kind: "moved", fileId: "f2" });
    expect(update).toHaveBeenCalledWith({
      fileId: "f2",
      addParents: "alb",
      removeParents: "up",
      fields: "id, parents",
    });
  });

  it("promoteToAlbum moves file from nested folder under uploads", async () => {
    get.mockImplementation(({ fileId, fields }: { fileId?: string; fields?: string }) => {
      if (fileId === "f3" && String(fields).includes("mimeType")) {
        return Promise.resolve({
          data: { id: "f3", name: "deep.jpg", mimeType: "image/jpeg", parents: ["sess"] },
        });
      }
      if (fileId === "f3") {
        return Promise.resolve({ data: { parents: ["sess"] } });
      }
      if (fileId === "sess") {
        return Promise.resolve({ data: { parents: ["up"] } });
      }
      return Promise.resolve({ data: {} });
    });
    update.mockResolvedValueOnce({ data: {} });
    const r = await promoteToAlbum("f3", {
      albumFolderId: "alb",
      uploadsFolderId: "up",
      cameraFolderId: null,
    });
    expect(r).toEqual({ kind: "moved", fileId: "f3" });
    expect(update).toHaveBeenCalledWith({
      fileId: "f3",
      addParents: "alb",
      removeParents: "sess",
      fields: "id, parents",
    });
  });

  it("ensureDriveLayoutOnStartup creates root, uploads, and album when missing", async () => {
    list
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [] } });
    create
      .mockResolvedValueOnce({ data: { id: "root-id", name: "EventRoot" } })
      .mockResolvedValueOnce({ data: { id: "up-id", name: "uploads" } })
      .mockResolvedValueOnce({ data: { id: "alb-id", name: "album" } });

    const layout = await ensureDriveLayoutOnStartup();
    expect(layout).toEqual({
      rootId: "root-id",
      uploadsId: "up-id",
      albumId: "alb-id",
      cameraFolderId: null,
    });
    expect(create).toHaveBeenCalledTimes(3);

    list.mockClear();
    create.mockClear();
    const again = await ensureDriveLayoutOnStartup();
    expect(again).toEqual(layout);
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("ensureDriveLayoutOnStartup includes cameraFolderId from env", async () => {
    process.env.GOOGLE_DRIVE_CAMERA_FOLDER_ID = "cam-123";
    list
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [] } });
    create
      .mockResolvedValueOnce({ data: { id: "root-id", name: "EventRoot" } })
      .mockResolvedValueOnce({ data: { id: "up-id", name: "uploads" } })
      .mockResolvedValueOnce({ data: { id: "alb-id", name: "album" } });
    const layout = await ensureDriveLayoutOnStartup();
    expect(layout.cameraFolderId).toBe("cam-123");
  });
});
