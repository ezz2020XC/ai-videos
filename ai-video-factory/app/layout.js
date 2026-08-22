import './globals.css';

export const metadata = {
  title: 'AI Video Factory',
  description: 'Idea → Generate → Review → Approve → Publish',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
