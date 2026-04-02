import { Cormorant_Garamond } from "next/font/google";

import { AlbumExperience } from "@/components/album/album-experience";
import { cn } from "@/lib/utils";

const albumDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-album-display",
});

export default function Home() {
  return (
    <div
      className={cn("relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2", albumDisplay.variable)}
    >
      <AlbumExperience />
    </div>
  );
}
