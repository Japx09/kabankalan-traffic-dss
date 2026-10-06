import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Kabankalan Traffic Microsimulation DSS',
  description:
    'Microsimulation-Based Safety and Operational Assessment of Public Transport Loading Zones and Pedestrian Conflicts in Kabankalan City',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-[#0a0a14] text-white overflow-hidden">
        {children}
      </body>
    </html>
  );
}
