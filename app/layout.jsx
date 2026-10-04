import { Caveat, DM_Sans } from 'next/font/google';
import './globals.css';

const caveat = Caveat({ subsets: ['latin'], variable: '--font-caveat', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });

export const metadata = {
  title: 'Miles Apart Booth',
  description: 'A photo booth for long-distance couples. Same frame, wherever you are.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1F2A44',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${caveat.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
