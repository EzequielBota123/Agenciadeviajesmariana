import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agencia de Viajes Mariana',
  description:
    'Paquetes, vuelos y escapadas a tu medida. Cotizá, comparás vuelos y creá flyers en un solo lugar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Playfair+Display:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
