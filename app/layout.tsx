import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BrandingProvider } from "@/components/branding/branding-provider";
import { ThemeAttributeProvider } from "@/components/theme/theme-attribute-provider";
import { getBranding } from "@/lib/branding";
import { getAuth } from "@/lib/auth/get-auth";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import { getThemeCookie } from "@/lib/theme/cookie";
import { isThemeOverrideAllowed } from "@/lib/data/settings";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const branding = getBranding();
  return {
    title: branding.appTitle,
    description: branding.description,
    ...(branding.faviconUrl
      ? { icons: { icon: branding.faviconUrl } }
      : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = getBranding();

  // Resolve the theme axis server-side so `data-theme` is correct on the first
  // paint (no flash, 02-305). The light/dark MODE axis stays with next-themes
  // (the `.dark` class) — these are orthogonal.
  const [auth, cookieTheme, overrideAllowed] = await Promise.all([
    getAuth(),
    getThemeCookie(),
    isThemeOverrideAllowed(),
  ]);
  const activeTheme = await resolveActiveTheme({
    userTheme: auth?.user.theme,
    cookieTheme,
  });

  return (
    <html lang="en" data-theme={activeTheme} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ThemeAttributeProvider
            initialTheme={activeTheme}
            overrideAllowed={overrideAllowed}
          >
            <BrandingProvider value={branding}>
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
            </BrandingProvider>
            <Toaster richColors position="top-right" theme="system" />
          </ThemeAttributeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
