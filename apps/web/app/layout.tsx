import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Reality Check',
  description: 'Adversarial QA for AI-built web applications.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
