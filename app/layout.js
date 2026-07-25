import './globals.css'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import { Providers } from './providers'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-serif', display: 'swap' })

export const metadata = {
  title: 'Olive Branch — Meet who is here now',
  description: 'A quiet way to meet the people already in the room. For pubs, bars and everything in between.',
  themeColor: '#3D4A2A',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
        <Toaster position="top-center" toastOptions={{ style: { background: '#3D4A2A', color: '#F5F1E8', border: '1px solid #B8935A' } }} />
      </body>
    </html>
  )
}
