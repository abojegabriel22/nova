

import { createAppKit } from '@reown/appkit/react'
import { solana } from '@reown/appkit/networks'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'

export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'aff6841422f8f2b803a5f11c1551a515'
export const solanaAdapter = new SolanaAdapter()

const metadata = {
  name: '$NOVA Web3 App',
  description: 'A web3 application built with Solana.',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: ['https://i.ibb.co/YTLhfMZ7/novacore.png']
}

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  metadata,
  projectId,
  themeMode: 'dark'
})