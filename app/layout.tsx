import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Underchargers HR Management", description: "Underchargers and MM HR Management workspace", applicationName:"Underchargers HR", manifest:"/manifest.webmanifest", appleWebApp:{capable:true,title:"UC HR",statusBarStyle:"default"} };
export const viewport: Viewport = { width:"device-width",initialScale:1,themeColor:"#f2bf25" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
