import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationWatcher } from "@/components/NotificationWatcher";
import { NotificationToast } from "@/components/NotificationToast";
import { PwaSetup } from "@/components/PwaSetup";
import { AppSplash } from "@/components/AppSplash";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YesBoss - AI Business Operating System",
  description: "Transform your business with AI-powered intelligence. Automated workflows, predictive analytics, and executive AI assistant all in one platform.",
  applicationName: "YesBoss",
  // the install manifest is src/app/manifest.ts, which Next links automatically
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "YesBoss", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Runs before the first paint: if the opening animation already played in this app session, skip it (see AppSplash) */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('yb_splash_done'))document.documentElement.classList.add('no-splash')}catch(e){}" }} />
        <PwaSetup />
        <AppSplash />
        <ThemeProvider>
          <ThemeToggle />
          <AuthProvider>
            <NotificationWatcher>
              {children}
              <NotificationToast />
            </NotificationWatcher>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
