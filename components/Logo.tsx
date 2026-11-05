import Image from 'next/image'
import logo from '@/public/ajaia-logo.png'

// Wordmark is 512x123; width follows from height.
export default function Logo({ height, preload }: { height: number; preload?: boolean }) {
  return <Image src={logo} alt="Ajaia" height={height} width={Math.round((height * 512) / 123)} preload={preload} />
}
