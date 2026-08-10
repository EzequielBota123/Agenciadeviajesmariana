import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tarifa Viva — La cotización que no miente',
  description:
    'Publicá el paquete, dejá que un agente controle la tarifa real del día contra las aerolíneas, y avisale al cliente cuándo esa cifra vence.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
