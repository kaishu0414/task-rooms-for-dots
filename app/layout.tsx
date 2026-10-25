import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };
export const metadata: Metadata = {
 title: "Task Rooms for Dots", description: "Your private task threads with your own dot.",
 manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "Task Rooms for Dots", statusBarStyle: "default" },
 icons: {icon: [{url:"/taskrooms.svg",type:"image/svg+xml"}],apple:[{url:"/icons/taskrooms-180.png",sizes:"180x180",type:"image/png"}]},
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ja"><body className="antialiased">{children}</body></html>;}
