import "./globals.css";

export const metadata = {
  title: "Consolidador de Portifólio",
  description: "Consolidação comercial de carteira de investimentos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
