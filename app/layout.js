import './globals.css'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import { Providers } from './providers'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-serif', display: 'swap' })

export const metadata = {
  title: 'Olive — Meet people in this venue',
  description: 'A quieter way to meet the people already in the room. For pubs, bars and everything in between.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Olive', statusBarStyle: 'black-translucent' },
  icons: {
    icon: '/olive_icon_192.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport = {
  themeColor: '#131814',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Olive" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}'}} />
      </head>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
        <Toaster position="top-center" toastOptions={{ style: { background: '#3D4A2A', color: '#F5F1E8', border: '1px solid #B8935A' } }} />
      </body>
    </html>
  )
}
