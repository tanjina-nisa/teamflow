import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TeamFlow — Smart Project & Team Management',
  description: 'Projects, Kanban boards, sprints, workload analytics and reports for software teams.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#6457f9', width: 'device-width', initialScale: 1 };

// Applies the saved theme before first paint (no flash).
const themeScript = `try{var t=localStorage.getItem('tf_theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
