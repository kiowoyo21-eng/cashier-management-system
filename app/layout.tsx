import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Cashier Management System', description: 'Generic cashier and transaction management frontend prototype' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
