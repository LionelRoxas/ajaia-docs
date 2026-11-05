import type { Metadata } from 'next'
import { Instrument_Sans, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'

const ui = Instrument_Sans({ variable: '--font-ui', subsets: ['latin'] })
const doc = Source_Serif_4({ variable: '--font-doc', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Ajaia Docs',
  description: 'Write, format and share documents.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${ui.variable} ${doc.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        {children}
      </body>
    </html>
  )
}
