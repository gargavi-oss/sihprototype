import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata = {
  title: "RailOpt · Block Planning",
  description:
    "Automatic block planning for Engineering, Signal & Telecom and Traction Distribution maintenance, coordinated with the Control Office timetable.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen vsc-intialized">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
