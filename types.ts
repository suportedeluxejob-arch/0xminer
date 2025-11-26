export type Tier = "basic" | "common" | "rare" | "epic" | "legendary" | "box" | "special"
export type ItemType = "miner" | "shelf" | "room" | "box"

export interface DBItem {
  id: string
  type: ItemType
  subtype?: ItemType
  name: string
  tier: Tier
  price: number
  desc?: string
  // Miner specific
  daily?: number
  power?: number
  fans?: number
  skinStyle?: string
  isSpecial?: boolean
  hidden?: boolean
  // Shelf/Room specific
  slots?: number
  // Room specific
  rent?: number
}

export interface InventoryItem {
  uid: string
  id: string
  type: ItemType
  parentId: string | null
  boughtAt: number
  // Room specific
  lastRentPaid?: number
  power?: boolean
  autoPay?: boolean
  health?: number // 0-100, só para mineradoras
  lastHealthUpdate?: number // timestamp da última atualização de health
}

export interface Log {
  id: number
  date: string
  desc: string
  amount: number | string
  type: "in" | "out" | "coin"
}

export interface GameState {
  wallet: number
  dpix: number
  miningPool: number
  inventory: InventoryItem[]
  logs: Log[]
  username: string
  createdAt: number
  referral: {
    code: string
    users: { lvl1: number; lvl2: number; lvl3: number }
    balance: number
    totalEarned: number
  }
}

export interface ToastMsg {
  id: number
  msg: string
  type: "success" | "error" | "info"
}
