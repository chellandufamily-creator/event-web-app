import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { normalizeLoginEmail } from "@/lib/sanitize";
import type { AppRole } from "@/types/auth";
import { isAppRole } from "@/types/auth";
import { COLLECTIONS } from "@/types/firestore-collections";

/**
 * If `users/{uid}` is missing and `emailInvites/{email}` is active, creates the user doc and consumes the invite.
 * Safe under concurrent logins (transaction).
 */
export async function tryProvisionUserFromEmailInvite(
  db: Firestore,
  uid: string,
  decoded: DecodedIdToken,
  tokenEmail: string
): Promise<boolean> {
  const emailLower = normalizeLoginEmail(tokenEmail);
  if (!emailLower) {
    return false;
  }

  const inviteRef = db.collection(COLLECTIONS.EMAIL_INVITES).doc(emailLower);
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);

  try {
    return await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (userSnap.exists) {
        return false;
      }
      const invSnap = await tx.get(inviteRef);
      if (!invSnap.exists) {
        return false;
      }
      const inv = invSnap.data()!;
      if (inv.active === false) {
        return false;
      }

      const role: AppRole = isAppRole(inv.grantedRole) ? inv.grantedRole : "uploader";
      const hint =
        typeof inv.displayNameHint === "string" && inv.displayNameHint.trim()
          ? inv.displayNameHint.trim()
          : null;
      const fromToken =
        typeof decoded.name === "string" && decoded.name.trim() ? decoded.name.trim() : null;
      const displayName = fromToken ?? hint;

      tx.set(userRef, {
        email: tokenEmail,
        displayName: displayName ?? null,
        photoURL: typeof decoded.picture === "string" ? decoded.picture : null,
        role,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(inviteRef, {
        active: false,
        consumedAt: FieldValue.serverTimestamp(),
        consumedByUid: uid,
      });
      return true;
    });
  } catch (e) {
    console.error("tryProvisionUserFromEmailInvite", e);
    return false;
  }
}
