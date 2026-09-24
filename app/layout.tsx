import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegister } from '@/components/pwa-register';
import { ViewportAdapter } from '@/components/viewport-adapter';
export const metadata: Metadata = { title: 'Oral — AI Speaking Trainer', description: 'One space to speak with confidence in English and Japanese.', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Oral' }, icons: { icon: '/icon.svg', apple: '/icon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f6f7f4' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><ViewportAdapter /><PwaRegister />{children}</body></html>; }
