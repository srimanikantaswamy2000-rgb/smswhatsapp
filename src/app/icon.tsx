import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// Brand favicon. Uses the firm's logo (public/logo.jpg — Sri Manikanta
// Swamy) when it exists; until then, a golden "S" monogram in the same
// palette as the sidebar BrandLogo fallback. Node runtime (not edge) so
// we can read the logo file at render time. Next.js auto-injects
// <link rel="icon"> for this route; it takes precedence over
// src/app/favicon.ico.

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  let logoDataUrl: string | null = null;
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "logo.jpg"));
    logoDataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    // No logo file yet — monogram fallback below.
  }

  return new ImageResponse(
    logoDataUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoDataUrl}
        alt=""
        width={32}
        height={32}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 16 }}
      />
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 45%, #c2410c 100%)",
          borderRadius: 16,
          color: "#ffffff",
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}
