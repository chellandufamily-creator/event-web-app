import Link from "next/link";

import { CameraRollReviewPanel } from "../../components/review/camera-roll-panel";
import { UploadReviewPanel } from "../../components/review/upload-review-panel";

export default function ReviewPage() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Review uploads</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Event camera originals and guest uploads. Admins can also use{" "}
          <Link href="/admin" className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100">
            Admin
          </Link>{" "}
          for codes and user management.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
        <CameraRollReviewPanel />
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Guest uploads
        </h2>
        <UploadReviewPanel />
      </section>
    </div>
  );
}
