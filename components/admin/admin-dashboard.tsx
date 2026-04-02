"use client";

import { useCallback, useEffect, useState } from "react";

import { UploadReviewPanel } from "@/components/review/upload-review-panel";
import type { AppRole } from "@/types/auth";

type TabId = "codes" | "uploads" | "users";

type InviteRow = {
  id: string;
  code: string;
  label: string | null;
  guestName: string | null;
  grantedRole: string;
  active: boolean;
  usedCount: number;
  maxUses: number | null;
  createdAt: string | null;
  expiresAt: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: AppRole;
  createdAt: string | null;
  updatedAt: string | null;
};

type EmailInviteRow = {
  emailLower: string;
  grantedRole: string;
  active: boolean;
  displayNameHint: string | null;
  createdBy: string | null;
  createdAt: string | null;
  consumedAt: string | null;
  consumedByUid: string | null;
};

const ROLE_OPTIONS: AppRole[] = ["admin", "approver", "uploader", "user"];

const tabBtn =
  "rounded-lg px-3 py-2 text-sm font-medium transition-colors data-[active=true]:bg-zinc-900 data-[active=true]:text-white dark:data-[active=true]:bg-zinc-100 dark:data-[active=true]:text-zinc-900 data-[active=false]:text-zinc-600 hover:bg-zinc-100 dark:data-[active=false]:text-zinc-400 dark:hover:bg-zinc-800";

export function AdminDashboard() {
  const [tab, setTab] = useState<TabId>("codes");
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [codes, setCodes] = useState<InviteRow[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [grantedRole, setGrantedRole] = useState<AppRole>("uploader");
  const [maxUses, setMaxUses] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AppRole>>({});
  const [userSaveBusy, setUserSaveBusy] = useState<string | null>(null);

  const [emailInvites, setEmailInvites] = useState<EmailInviteRow[]>([]);
  const [emailInvitesLoading, setEmailInvitesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteGrantedRole, setInviteGrantedRole] = useState<AppRole>("uploader");
  const [inviteDisplayHint, setInviteDisplayHint] = useState("");
  const [inviteCreateBusy, setInviteCreateBusy] = useState(false);
  const [inviteRevokeBusy, setInviteRevokeBusy] = useState<string | null>(null);

  const showBanner = useCallback((type: "ok" | "err", text: string) => {
    setBanner({ type, text });
    window.setTimeout(() => setBanner(null), 5000);
  }, []);

  const loadCodes = useCallback(async () => {
    setCodesLoading(true);
    try {
      const res = await fetch("/api/admin/invite-codes", { credentials: "include" });
      const json = (await res.json()) as { codes?: InviteRow[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load codes");
      }
      setCodes(json.codes ?? []);
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Failed to load codes");
    } finally {
      setCodesLoading(false);
    }
  }, [showBanner]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const json = (await res.json()) as { users?: UserRow[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load users");
      }
      const list = json.users ?? [];
      setUsers(list);
      const drafts: Record<string, AppRole> = {};
      for (const u of list) {
        drafts[u.id] = u.role;
      }
      setRoleDrafts(drafts);
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, [showBanner]);

  const loadEmailInvites = useCallback(async () => {
    setEmailInvitesLoading(true);
    try {
      const res = await fetch("/api/admin/email-invites", { credentials: "include" });
      const json = (await res.json()) as { invites?: EmailInviteRow[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load email invites");
      }
      setEmailInvites(json.invites ?? []);
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Failed to load email invites");
    } finally {
      setEmailInvitesLoading(false);
    }
  }, [showBanner]);

  useEffect(() => {
    if (tab === "codes") {
      void loadCodes();
    }
  }, [tab, loadCodes]);

  useEffect(() => {
    if (tab === "users") {
      void loadUsers();
      void loadEmailInvites();
    }
  }, [tab, loadUsers, loadEmailInvites]);

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      showBanner("err", "Name / label is required.");
      return;
    }
    setCreateBusy(true);
    try {
      const body: Record<string, unknown> = {
        label: trimmed,
        grantedRole,
      };
      const mu = maxUses.trim() ? Number(maxUses) : NaN;
      if (Number.isFinite(mu) && mu > 0) {
        body.maxUses = mu;
      }
      const ed = expiresInDays.trim() ? Number(expiresInDays) : NaN;
      if (Number.isFinite(ed) && ed > 0) {
        body.expiresInDays = ed;
      }
      const res = await fetch("/api/admin/invite-codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { invite?: { code: string }; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not create code");
      }
      setLabel("");
      setMaxUses("");
      setExpiresInDays("");
      showBanner("ok", `Code created: ${json.invite?.code ?? ""}`);
      await loadCodes();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : "Could not create code");
    } finally {
      setCreateBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showBanner("ok", "Copied to clipboard.");
    } catch {
      showBanner("err", "Could not copy.");
    }
  };

  const saveUserRole = async (uid: string) => {
    const role = roleDrafts[uid];
    if (!role) {
      return;
    }
    setUserSaveBusy(uid);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Save failed");
      }
      showBanner("ok", "Role updated.");
      await loadUsers();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Save failed");
    } finally {
      setUserSaveBusy(null);
    }
  };

  const createEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) {
      showBanner("err", "Email is required.");
      return;
    }
    setInviteCreateBusy(true);
    try {
      const body: Record<string, unknown> = {
        email,
        grantedRole: inviteGrantedRole,
      };
      const hint = inviteDisplayHint.trim();
      if (hint) {
        body.displayNameHint = hint;
      }
      const res = await fetch("/api/admin/email-invites", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to create invite");
      }
      showBanner("ok", `Invite saved for ${email.trim().toLowerCase()}. They can sign in with Google/email on the login page.`);
      setInviteEmail("");
      setInviteDisplayHint("");
      await loadEmailInvites();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setInviteCreateBusy(false);
    }
  };

  const revokeEmailInvite = async (emailLower: string) => {
    setInviteRevokeBusy(emailLower);
    try {
      const res = await fetch(`/api/admin/email-invites/${encodeURIComponent(emailLower)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Revoke failed");
      }
      showBanner("ok", "Invite revoked.");
      await loadEmailInvites();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setInviteRevokeBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Admin dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Invite codes, upload review, and user roles.</p>
      </div>

      {banner ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
        {(
          [
            ["codes", "Invite codes"],
            ["uploads", "Upload review"],
            ["users", "Users"],
          ] as const
        ).map(([id, labelText]) => (
          <button key={id} type="button" data-active={tab === id} className={tabBtn} onClick={() => setTab(id)}>
            {labelText}
          </button>
        ))}
      </div>

      {tab === "codes" ? (
        <section className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Create code</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Generate an invite code and assign a display name.</p>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={createCode}>
              <div className="sm:col-span-2">
                <label htmlFor="code-label" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Name / label
                </label>
                <input
                  id="code-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                  placeholder="e.g. Smith family table"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="code-role" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Role granted
                </label>
                <select
                  id="code-role"
                  value={grantedRole}
                  onChange={(e) => setGrantedRole(e.target.value as AppRole)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="max-uses" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Max uses (optional)
                  </label>
                  <input
                    id="max-uses"
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                    placeholder="∞"
                  />
                </div>
                <div>
                  <label htmlFor="exp-days" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Expires in days
                  </label>
                  <input
                    id="exp-days"
                    type="number"
                    min={1}
                    max={365}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                    placeholder="none"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={createBusy}
                  className="min-h-11 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {createBusy ? "Creating…" : "Generate code"}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent codes</h2>
              <button
                type="button"
                onClick={() => void loadCodes()}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Code</th>
                    <th className="px-4 py-2 font-medium">Label</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Uses</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {codesLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : codes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                        No codes yet.
                      </td>
                    </tr>
                  ) : (
                    codes.map((row) => (
                      <tr key={row.id} className="text-zinc-800 dark:text-zinc-200">
                        <td className="px-4 py-2 font-mono text-xs">{row.code}</td>
                        <td className="px-4 py-2">{row.label ?? "—"}</td>
                        <td className="px-4 py-2">{row.grantedRole}</td>
                        <td className="px-4 py-2">
                          {row.usedCount}
                          {row.maxUses != null ? ` / ${row.maxUses}` : ""}
                        </td>
                        <td className="px-4 py-2 text-xs text-zinc-500">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => void copyCode(row.code)}
                            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "uploads" ? (
        <section>
          <UploadReviewPanel />
        </section>
      ) : null}

      {tab === "users" ? (
        <div className="space-y-8">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Email invites</h2>
                <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
                  When this person signs in with Google or email on the login page, their Firestore{" "}
                  <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">users/{"{uid}"}</code> profile is
                  created automatically with the role you set. Re-sending an invite reopens access if they have not
                  signed in yet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadEmailInvites();
                }}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Refresh invites
              </button>
            </div>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={createEmailInvite}>
              <div className="sm:col-span-2">
                <label
                  htmlFor="invite-email"
                  className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Email (must match their Google / Firebase account)
                </label>
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label
                  htmlFor="invite-role-email"
                  className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Role on first login
                </label>
                <select
                  id="invite-role-email"
                  value={inviteGrantedRole}
                  onChange={(e) => setInviteGrantedRole(e.target.value as AppRole)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="invite-hint"
                  className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Display name hint (optional)
                </label>
                <input
                  id="invite-hint"
                  value={inviteDisplayHint}
                  onChange={(e) => setInviteDisplayHint(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                  placeholder="If Google does not provide a name"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={inviteCreateBusy}
                  className="min-h-11 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {inviteCreateBusy ? "Saving…" : "Save invite"}
                </button>
              </div>
            </form>

            <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {emailInvitesLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : emailInvites.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        No email invites yet.
                      </td>
                    </tr>
                  ) : (
                    emailInvites.map((row) => (
                      <tr key={row.emailLower} className="text-zinc-800 dark:text-zinc-200">
                        <td className="px-4 py-2 text-xs">{row.emailLower}</td>
                        <td className="px-4 py-2">{row.grantedRole}</td>
                        <td className="px-4 py-2 text-xs">
                          {row.active ? (
                            <span className="text-amber-700 dark:text-amber-300">Pending</span>
                          ) : row.consumedAt ? (
                            <span className="text-emerald-700 dark:text-emerald-300">Used</span>
                          ) : (
                            <span className="text-zinc-500">Revoked</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-zinc-500">
                          {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {row.active ? (
                            <button
                              type="button"
                              disabled={inviteRevokeBusy === row.emailLower}
                              onClick={() => void revokeEmailInvite(row.emailLower)}
                              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                              {inviteRevokeBusy === row.emailLower ? "…" : "Revoke"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Users</h2>
              <button
                type="button"
                onClick={() => void loadUsers()}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                        No user documents in Firestore yet.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const draft = roleDrafts[u.id] ?? u.role;
                      const dirty = draft !== u.role;
                      return (
                        <tr key={u.id} className="text-zinc-800 dark:text-zinc-200">
                          <td className="px-4 py-2 text-xs">{u.email ?? u.id}</td>
                          <td className="px-4 py-2">{u.displayName ?? "—"}</td>
                          <td className="px-4 py-2">
                            <select
                              value={draft}
                              onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [u.id]: e.target.value as AppRole }))}
                              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              disabled={!dirty || userSaveBusy === u.id}
                              onClick={() => void saveUserRole(u.id)}
                              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                            >
                              {userSaveBusy === u.id ? "Saving…" : "Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
