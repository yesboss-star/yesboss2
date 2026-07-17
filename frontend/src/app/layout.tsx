import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationWatcher } from "@/components/NotificationWatcher";
import { NotificationToast } from "@/components/NotificationToast";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
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
