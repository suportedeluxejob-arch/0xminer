"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { ITEMS_DB, DPIX_PRICE_BRL, RENT_DURATION_MS, EXCHANGE_FEE } from "./constants"
import type { GameState, DBItem, InventoryItem, Tier, ToastMsg, ItemType } from "./types"

const MINER_SPECS: Record<string, { mult: string; daily: number; roi: string }> = {
  basic: { mult: "1.00x", daily: 6.25, roi: "16.0" },
  common: { mult: "1.25x", daily: 7.81, roi: "12.8" },
  rare: { mult: "1.65x", daily: 10.31, roi: "9.7" },
  epic: { mult: "2.15x", daily: 13.43, roi: "7.4" },
  legendary: { mult: "3.00x", daily: 18.75, roi: "5.3" },
}

// --- HELPER FUNCTIONS (Moved outside to prevent re-creation) ---
const formatBRL = (val: number) => {
  if (val < 0.01 && val > 0) {
    return val.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const formatDPIX = (val: number) => {
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M Ð`
  if (val >= 1000) return `${(val / 1000).toFixed(2)}K Ð`
  if (val >= 10) return `${val.toFixed(2)} Ð`
  return `${val.toFixed(4)} Ð`
}

const getAccountAgeDays = (createdAt: number) => {
  const diff = Date.now() - createdAt
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

const getWithdrawFee = (createdAt: number) => {
  const days = getAccountAgeDays(createdAt)
  if (days <= 10) return { rate: 0.3, label: "30%", color: "text-neon-red", barClass: "step-bad" }
  if (days <= 20) return { rate: 0.15, label: "15%", color: "text-neon-yellow", barClass: "step-mid" }
  return { rate: 0.05, label: "5%", color: "text-neon-green", barClass: "step-good" }
}

const getActiveDailyProduction = (inventory: InventoryItem[]) => {
  const rooms = inventory.filter((i) => i.type === "room")
  let total = 0
  rooms.forEach((room) => {
    // Check 1: Room must have power enabled
    if (room.power === false) return

    // Check 2: Room rent must be valid (time left> 0)
    const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
    if (timeLeft <= 0) return

    const shelves = inventory.filter((s) => s.parentId === room.uid)
    shelves.forEach((shelf) => {
      inventory
        .filter((m) => m.parentId === shelf.uid)
        .forEach((miner) => {
          const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
          if (dbMiner) {
            // Check 3: Miner must have health> 0
            const health = miner.health ?? 100
            if (health <= 0) return

            // Use standardized production from MINER_SPECS if available, otherwise fallback to DB
            const specs = MINER_SPECS[dbMiner.tier]
            total += specs ? specs.daily : (dbMiner.daily || 0)
          }
        })
    })
  })
  return total
}

const getActivePower = (inventory: InventoryItem[]) => {
  const rooms = inventory.filter((i) => i.type === "room")
  let total = 0
  rooms.forEach((room) => {
    if (room.power === false) return
    const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
    if (timeLeft <= 0) return
    const shelves = inventory.filter((s) => s.parentId === room.uid)
    shelves.forEach((shelf) => {
      inventory
        .filter((m) => m.parentId === shelf.uid)
        .forEach((miner) => {
          const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
          if (dbMiner) {
            const health = miner.health ?? 100
            if (health <= 0) return
            total += dbMiner.power || 0
          }
        })
    })
  })
  return total
}

const getActiveWatts = (inv: InventoryItem[]) => {
  let total = 0
  const miners = inv.filter((i) => i.type === "miner")
  miners.forEach((m) => {
    if (m.parentId) {
      const shelf = inv.find((s) => s.uid === m.parentId)
      if (shelf && shelf.parentId) {
        const room = inv.find((r) => r.uid === shelf.parentId)
        if (room && room.power !== false) {
          const dbItem = ITEMS_DB.miner.find((x) => x.id === m.id)
          if (dbItem && dbItem.power) total += Math.floor(dbItem.power * 0.8)
        }
      }
    }
  })
  return total
}

const getTotalRentCost = (inv: InventoryItem[]) => {
  let total = 0
  inv
    .filter((i) => i.type === "room")
    .forEach((room) => {
      const dbRoom = ITEMS_DB.room.find((r) => r.id === room.id)
      if (dbRoom && dbRoom.rent) total += dbRoom.rent
    })
  return total
}



const calculateNetWorth = (state: GameState) => {
  let total = state.wallet // BRL Balance
  total += state.dpix * DPIX_PRICE_BRL // DPIX Balance converted to BRL

  // Inventory Value
  state.inventory.forEach((item) => {
    const dbItem = ITEMS_DB[item.type]?.find((x) => x.id === item.id)
    if (dbItem && dbItem.price) {
      total += dbItem.price
    }
  })

  return total
}

const getTierColor = (tier: Tier) => {
  switch (tier) {
    case "basic":
      return "#888888"
    case "common":
      return "#00b85f"
    case "rare":
      return "#00a3bf"
    case "epic":
      return "#8a1ccc"
    case "legendary":
      return "#cc9000"
    case "box":
      return "#ffb300"
    case "special":
      return "#ff0099"
    default:
      return "#888"
  }
}

const getRarityClass = (tier: Tier) => {
  switch (tier) {
    case "basic":
      return "bg-tier-basic text-[#222]"
    case "common":
      return "bg-tier-common text-[#000]"
    case "rare":
      return "bg-tier-rare text-[#000]"
    case "epic":
      return "bg-tier-epic text-[#fff]"
    case "legendary":
      return "bg-tier-legendary text-[#000] shadow-[0_0_10px_var(--tier-legendary)]"
    case "box":
      return "bg-tier-box text-[#000]"
    case "special":
      return "bg-tier-special text-white shadow-[0_0_10px_var(--tier-special)]"
    default:
      return "bg-gray-500"
  }
}

const getTierLabel = (tier: Tier) => {
  switch (tier) {
    case "basic":
      return "Item Básico"
    case "common":
      return "Item Comum"
    case "rare":
      return "Item Raro"
    case "epic":
      return "Item Épico"
    case "legendary":
      return "Item Lendário"
    case "special":
      return "Item Especial"
    default:
      return "Item"
  }
}

const Tooltip = ({ children, text }: { children: React.ReactNode; text: string }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-black/95 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none animate-fade-in border border-white/10">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-black/95"></div>
        </div>
      )}
    </div>
  )
}

// --- ISOLATED COMPONENTS (Prevents flickering) ---

const RarityBadge = React.memo(({ tier }: { tier: Tier }) => (
  <span
    className={`text-[9px] font-extrabold uppercase px-2 py-[3px] rounded tracking-widest mt-1 inline-block ${getRarityClass(tier)}`}
  >
    {tier}
  </span>
))

const FinancialTable = React.memo(({ inventory }: { inventory: InventoryItem[] }) => {
  const dailyDpix = getActiveDailyProduction(inventory)
  const dailyGross = dailyDpix * DPIX_PRICE_BRL
  const dailyRentCost = getTotalRentCost(inventory) * 2 // 12h cycle x2
  const dailyExchangeFee = dailyGross * EXCHANGE_FEE
  const dailyNet = dailyGross - dailyRentCost - dailyExchangeFee
  const margin = dailyGross > 0 ? (dailyNet / dailyGross) * 100 : 0

  const periods = [
    { name: "Dia (24h)", mult: 1 },
    { name: "Semana (7d)", mult: 7 },
    { name: "Mês (30d)", mult: 30 },
  ]

  return (
    <div className="animate-slide-in">
      <p className="text-[#888] mb-8">Projeções baseadas na sua infraestrutura atual ativa.</p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 mb-8">
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-dpix-color"></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Faturamento Diário</div>
          <div className="text-2xl font-bold text-dpix-color font-mono">{formatBRL(dailyGross)}</div>
          <div className="text-xs text-text-muted mt-1">
            {dailyDpix.toFixed(2)} DPIX/dia × R$ {DPIX_PRICE_BRL.toFixed(2)}
          </div>
        </div>
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-red"></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Custo Diário (Energia)</div>
          <div className="text-2xl font-bold text-neon-red font-mono">{formatBRL(dailyRentCost)}</div>
          <div className="text-xs text-text-muted mt-1">2 ciclos de 12h por dia</div>
        </div>
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-yellow"></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Taxas de Câmbio (5%)</div>
          <div className="text-2xl font-bold text-neon-yellow font-mono">{formatBRL(dailyExchangeFee)}</div>
          <div className="text-xs text-text-muted mt-1">5% sobre conversão DPIX → BRL</div>
        </div>
        <div className="bg-card-bg rounded-xl p-5 border border-border-color relative overflow-hidden">
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 ${dailyNet >= 0 ? "bg-neon-green" : "bg-neon-red"}`}
          ></div>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-2.5">Lucro Líquido Diário</div>
          <div className={`text-2xl font-bold font-mono ${dailyNet >= 0 ? "text-neon-green" : "text-neon-red"}`}>
            {formatBRL(dailyNet)}
          </div>
          <div className="text-xs text-text-muted mt-1">
            Margem:{" "}
            <span className={`font-bold ${dailyNet >= 0 ? "text-neon-green" : "text-neon-red"}`}>
              {margin.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <h3 className="mt-8 mb-4 border-b border-[#333] pb-2 text-white font-bold text-lg">Projeções Futuras</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-2.5">
          <thead>
            <tr>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Período</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Produção DPIX</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Faturamento Bruto</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Custo Energia</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Taxas (5%)</th>
              <th className="text-left text-[#888] p-2.5 text-xs uppercase border-b border-[#33]">Lucro Líquido</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p, idx) => {
              const dpixProd = dailyDpix * p.mult
              const gross = dailyGross * p.mult
              const cost = dailyRentCost * p.mult
              const fee = dailyExchangeFee * p.mult
              const net = dailyNet * p.mult
              const color = net >= 0 ? "text-neon-green" : "text-neon-red"
              return (
                <tr key={idx}>
                  <td className="bg-card-bg p-4 text-white border-y border-[#333] border-l rounded-l-lg font-medium">
                    {p.name}
                  </td>
                  <td className="bg-card-bg p-4 text-dpix-color border-y border-[#333] font-mono">
                    {dpixProd.toFixed(2)} Ð
                  </td>
                  <td className="bg-card-bg p-4 text-white border-y border-[#333] font-mono">{formatBRL(gross)}</td>
                  <td className="bg-card-bg p-4 text-neon-red border-y border-[#333] font-mono">{formatBRL(cost)}</td>
                  <td className="bg-card-bg p-4 text-neon-yellow border-y border-[#333] font-mono">{formatBRL(fee)}</td>
                  <td
                    className={`bg-card-bg p-4 font-bold border-y border-[#333] border-r rounded-r-lg ${color} font-mono`}
                  >
                    {formatBRL(net)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
})

// Renomeando ShopView para MarketView e adicionando prop onOpenBox
const MarketView = React.memo(
  ({
    filter,
    setFilter,
    onBuy,
    onOpenBox, // Keep this for now, even if not used directly in MarketView rendering
  }: {
    filter: string
    setFilter: (f: string) => void
    onBuy: (item: DBItem, type: string) => void
    onOpenBox: (tier: Tier, subtype: ItemType) => void
  }) => {
    const items = useMemo(() => {
      return filter === "special"
        ? ITEMS_DB.miner.filter((i) => i.isSpecial)
        : ITEMS_DB[filter].filter((i) => !i.hidden && !i.isSpecial)
    }, [filter])

    return (
      <div className="p-8 animate-slide-in max-w-7xl mx-auto w-full pb-32">
        {/* Header & Featured Banner */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
            <i className="fa-solid fa-shop text-accent"></i> Mercado Global
          </h2>

          {/* Featured Banner */}
          <div className="relative rounded-2xl overflow-hidden border border-accent/30 shadow-[0_0_30px_rgba(0,255,153,0.1)] group">
            <div className="absolute inset-0 bg-gradient-to-r from-black via-[#111] to-transparent z-10"></div>
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2832&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:scale-105 transition-transform duration-700"></div>

            <div className="relative z-20 p-8 md:p-12 flex flex-col items-start max-w-2xl">
              <span className="bg-accent text-black text-[10px] font-bold px-2 py-1 rounded mb-3 uppercase tracking-wider">Destaque da Semana</span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-2 leading-tight">
                Mineradoras <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-emerald-400">Next-Gen</span>
              </h3>
              <p className="text-gray-300 mb-6 text-sm md:text-base">
                Aumente seu hashrate com as novas ASICs de alta eficiência. ROI otimizado e menor consumo de energia.
              </p>
              <button
                onClick={() => setFilter('miner')}
                className="bg-white text-black px-6 py-2.5 rounded-lg font-bold hover:bg-accent transition-colors flex items-center gap-2"
              >
                Ver Ofertas <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex gap-2.5 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {["miner", "shelf", "room"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-6 py-2.5 rounded-xl border font-bold transition-all text-sm uppercase whitespace-nowrap flex items-center gap-2 ${filter === t ? "bg-[#222] border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]" : "bg-[#111] border-[#333] text-[#888] hover:border-[#666] hover:text-white"}`}
            >
              {t === "miner" && <i className="fa-solid fa-microchip"></i>}
              {t === "shelf" && <i className="fa-solid fa-server"></i>}
              {t === "room" && <i className="fa-solid fa-warehouse"></i>}
              {t === "miner" ? "Mineradoras" : t === "shelf" ? "Prateleiras" : "Quartos"}
            </button>
          ))}
          <button
            onClick={() => setFilter("special")}
            className={`px-6 py-2.5 rounded-xl border font-bold transition-all text-sm uppercase whitespace-nowrap flex items-center gap-2 ${filter === "special" ? "bg-tier-special/10 border-tier-special text-tier-special shadow-[0_0_15px_rgba(255,0,153,0.2)]" : "bg-[#111] border-[#333] text-[#888] hover:text-tier-special hover:border-tier-special"}`}
          >
            <i className="fa-solid fa-star"></i> Especiais
          </button>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {items.map((item) => {
            const isBox = item.tier === "box"
            const isSpecial = item.isSpecial
            let visual = null
            let stats = null

            if (item.type === "miner" || item.isSpecial) {
              const fanCount = item.fans || 1
              const styleClass = item.skinStyle ? `style-${item.skinStyle}` : ""
              const tierColor = getTierColor(item.tier)
              visual = (
                <div
                  className={`w-[180px] h-[80px] rounded-md border border-[#333] flex items-center justify-around px-[5px] shadow-lg transition-all bg-gradient-to-b from-[#2a2d3a] to-[#151621] ${styleClass}`}
                  style={{ borderBottom: item.tier !== "basic" && !isBox ? `2px solid ${tierColor}` : "" }}
                >
                  {[...Array(fanCount)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[35px] h-[35px] rounded-full bg-[#0b0c15] border border-[#444] relative flex items-center justify-center"
                    >
                      <div
                        className={`w-full h-full rounded-full fan-blades-gradient opacity-80 animate-spin-slow`}
                      ></div>
                    </div>
                  ))}
                </div>
              )
              const specs = MINER_SPECS[item.tier] || { mult: "1.00x", daily: item.daily || 0, roi: "0.0" }

              stats = (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[#888] text-xs uppercase">Poder</span>
                    <span className="font-bold text-white">{item.power.toFixed(0)} MH/s</span>
                  </div>



                  <div className="flex justify-between items-center">
                    <span className="text-[#888] text-xs uppercase">Produção</span>
                    <span className="font-bold text-dpix-color">{specs.daily.toFixed(2)} Ð</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[#888] text-xs uppercase">ROI (Box)</span>
                    <span className="font-bold text-neon-green">{specs.roi} Dias</span>
                  </div>
                </div>
              )
            } else if (item.type === "shelf") {
              visual = (
                <div className="w-[100px] h-[90px] bg-[#1a1c29] border border-[#444] rounded flex flex-col justify-between p-[5px]">
                  <div className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm bg-neon-green"></div>
                  <div
                    className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm"
                    style={{ background: (item.slots || 0) >= 4 ? "#00e676" : "#333" }}
                  ></div>
                  <div
                    className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm"
                    style={{ background: (item.slots || 0) >= 6 ? "#00e676" : "#333" }}
                  ></div>
                </div>
              )

              stats = (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[#888] text-xs uppercase">Capacidade</span>
                    <span className="font-bold text-neon-green text-base">{item.slots} Slots</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[#888] text-xs uppercase">Custo/Slot</span>
                    <span className="font-bold text-white">{(item.price / (item.slots || 1)).toFixed(0)} Ð</span>
                  </div>
                </div>
              )
            } else if (item.type === "room") {
              visual = (
                <div className={`w-full h-full flex items-center justify-center relative theme-${item.tier}`}>
                  <i className={`fa-solid fa-house-laptop text-[50px] text-white/80 drop-shadow-lg`}></i>
                </div>
              )

              stats = (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[#888] text-xs uppercase">Capacidade</span>
                    <span className="font-bold text-neon-green text-base">{item.slots} Racks</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[#888] text-xs uppercase">Aluguel/12h</span>
                    <span className="font-bold text-neon-red">{formatBRL(item.rent || 0)}</span>
                  </div>
                </div>
              )
            } else if (isBox) {
              visual = (
                <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_center,#222_0%,#111_100%)]">
                  <i className="fa-solid fa-cube text-[42px] text-tier-box drop-shadow-lg group-hover:scale-105 transition-transform"></i>
                </div>
              )
              stats = (
                <div className="flex flex-col gap-2.5">
                  <div className="text-xs text-[#aaa] text-center mb-1">{item.desc}</div>
                  <div className="flex h-2 w-full bg-[#111] rounded overflow-hidden">
                    <div className="h-full bg-tier-basic w-[60%]"></div>
                    <div className="h-full bg-tier-common w-[25%]"></div>
                    <div className="h-full bg-tier-rare w-[10%]"></div>
                    <div className="h-full bg-tier-epic w-[4%]"></div>
                    <div className="h-full bg-tier-legendary w-[1%]"></div>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[#666] px-0.5 mt-1">
                    <span className="text-tier-basic">60%</span>
                    <span className="text-tier-common">25%</span>
                    <span className="text-tier-rare">10%</span>
                    <span className="text-tier-epic">4%</span>
                    <span className="text-tier-legendary">1%</span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className="bg-card-bg border border-border-color rounded-xl flex flex-col overflow-hidden relative group hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/10 transition-all"
                data-tier={item.tier}
              >
                <div className="p-3 bg-black/40 flex flex-col items-center justify-center border-b border-white/5 text-center min-h-[70px]">
                  <span className="font-bold text-white text-base leading-tight mb-1">{item.name}</span>
                  <RarityBadge tier={item.tier} />
                </div>
                <div className="h-[140px] bg-black/20 flex items-center justify-center border-b border-white/5 relative overflow-hidden shrink-0 group-hover:bg-black/30 transition-colors">
                  {visual}
                </div>
                <div className="p-5 grow flex flex-col justify-between min-h-[140px]">
                  <div>{stats}</div>
                  <div className="mt-5 pt-4 border-t border-border-color flex justify-between items-center">
                    {/* Preço agora em DPIX */}
                    <div className="font-bold text-lg">
                      <span className="text-dpix-color">Ð</span>{" "}
                      <span className="text-white font-mono">{item.price.toLocaleString("pt-BR")}</span>
                    </div>
                    <button
                      onClick={() => (isBox ? onOpenBox(item.tier, item.subtype as ItemType) : onBuy(item, filter))}
                      className={`px-5 py-2 rounded-lg text-xs font-bold uppercase transition-all border shadow-lg ${isBox ? "bg-[#333] border-[#555] text-white hover:bg-tier-box hover:text-black hover:border-tier-box" : isSpecial ? "bg-transparent border-tier-special text-tier-special hover:bg-tier-special hover:text-white" : "bg-white text-black border-white hover:bg-accent hover:border-accent"}`}
                    >
                      Comprar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {filter !== "special" && (
          <div className="mt-10 p-5 bg-[#151621] border border-[#2d2d3d] rounded-xl">
            <div className="text-xs text-[#888] uppercase tracking-widest mb-4 flex items-center gap-2 font-bold">
              <i className="fa-solid fa-chart-pie"></i> Probabilidades de Drop (Box)
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[
                { tier: "basic", pct: "60%", label: "Básico", color: "text-white" },
                { tier: "common", pct: "25%", label: "Comum", color: "text-tier-common" },
                { tier: "rare", pct: "10%", label: "Raro", color: "text-tier-rare" },
                { tier: "epic", pct: "4%", label: "Épico", color: "text-tier-epic" },
                { tier: "legendary", pct: "1%", label: "Lendário", color: "text-tier-legendary" },
              ].map((p, i) => (
                <div
                  key={i}
                  className="bg-[#0b0c15] border border-[#333] rounded-lg p-4 text-center relative overflow-hidden transition-transform hover:-translate-y-0.5"
                >
                  <div
                    className="absolute bottom-0 left-0 w-full h-[3px]"
                    style={{ backgroundColor: getTierColor(p.tier as Tier) }}
                  ></div>
                  <div
                    className={`text-xl font-bold font-mono mb-1 ${p.color}`}
                    style={p.tier !== "basic" ? { textShadow: `0 0 10px ${getTierColor(p.tier as Tier)}4D` } : {}}
                  >
                    {p.pct}
                  </div>
                  <div className="text-[11px] text-[#aaa] uppercase tracking-wide">{p.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  },
)

const InfraView = React.memo(
  ({
    inventory,
    onPayRent,
    onInstall,
    onUninstall,
    onToggleAutoPay,
    setActiveView,
    setShopFilter,
    onRepairMiner,
    onPayAllEnergy, // Adicionando prop para pagar todos
    onDemolishRoom, // Adicionando prop para demolir quarto
  }: {
    inventory: InventoryItem[]
    onPayRent: (uid: string) => void
    onInstall: (type: string, uid: string) => void
    onUninstall: (uid: string) => void
    onToggleAutoPay: (uid: string) => void
    setActiveView: (v: string) => void
    setShopFilter: (f: string) => void
    onRepairMiner: (uid: string) => void
    onPayAllEnergy: (rarity: Tier) => void // Tipo da nova prop
    onDemolishRoom: (uid: string) => void // Tipo da nova prop
  }) => {
    const [, setTick] = useState(0)
    const [selectedSector, setSelectedSector] = useState<Tier | null>(null)

    // Independent timer loop for smooth visual updates without re-rendering parent
    useEffect(() => {
      const timer = setInterval(() => setTick((t) => t + 1), 1000)
      return () => clearInterval(timer)
    }, [])

    const rooms = inventory.filter((i) => i.type === "room")

    // Group rooms by tier
    const roomsBySector = rooms.reduce(
      (acc, room) => {
        const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
        if (dbRoom) {
          if (!acc[dbRoom.tier]) acc[dbRoom.tier] = []
          acc[dbRoom.tier].push(room)
        }
        return acc
      },
      {} as Record<Tier, InventoryItem[]>,
    )

    // Check if sector has rooms with low energy (< 1h)
    const hasLowEnergy = (tier: Tier) => {
      const sectorRooms = roomsBySector[tier] || []
      return sectorRooms.some((room) => {
        const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
        return timeLeft < 3600000 && timeLeft > 0 // Less than 1 hour
      })
    }

    // Check if sector has broken miners
    const hasBrokenMiners = (tier: Tier) => {
      const sectorRooms = roomsBySector[tier] || []
      return sectorRooms.some((room) => {
        const shelves = inventory.filter((i) => i.parentId === room.uid)
        return shelves.some((shelf) => {
          const miners = inventory.filter((m) => m.parentId === shelf.uid)
          return miners.some((miner) => (miner.health ?? 100) <= 0)
        })
      })
    }

    const sectors: { tier: Tier; name: string; icon: string }[] = [
      { tier: "basic", name: "Setor Básico", icon: "fa-house" },
      { tier: "common", name: "Setor Comum", icon: "fa-building" },
      { tier: "rare", name: "Setor Raro", icon: "fa-industry" },
      { tier: "epic", name: "Setor Épico", icon: "fa-city" },
      { tier: "legendary", name: "Setor Lendário", icon: "fa-tower-broadcast" },
    ]

    // If a sector is selected, show detailed view
    if (selectedSector) {
      const sectorRooms = roomsBySector[selectedSector] || []
      const sectorInfo = sectors.find((s) => s.tier === selectedSector)

      const rentCosts: Record<Tier, number> = {
        basic: 0.6,
        common: 1.5,
        rare: 3.5,
        epic: 8.0,
        legendary: 20.0,
      }

      const costPerRoom = rentCosts[selectedSector]

      const roomsNeedingEnergy = sectorRooms.filter((room) => {
        const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
        return timeLeft <= 0 || timeLeft < RENT_DURATION_MS
      })

      const totalEnergyCost = costPerRoom * roomsNeedingEnergy.length
      const canPayAll = roomsNeedingEnergy.length > 0

      return (
        <div className="relative w-full min-h-screen pb-20 overflow-hidden">
          {/* Immersive Background */}
          <div className="fixed inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-[#0b0c15]/80 z-10"></div>
            <img src="/server-room-bg.png" className="w-full h-full object-cover opacity-40" alt="Server Room" />
          </div>

          <div className="relative z-10 p-8 animate-slide-in max-w-[1400px] mx-auto w-full">

            {/* Holographic Header */}
            <div className="flex justify-between items-center mb-8 bg-black/40 backdrop-blur-md border border-blue-500/30 p-4 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.1)]">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedSector(null)}
                  className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-4 py-2 rounded hover:bg-blue-500/20 transition-all flex items-center gap-2 font-mono text-sm uppercase"
                >
                  <i className="fa-solid fa-chevron-left"></i> Voltar
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3 font-mono tracking-wider shadow-blue-glow">
                    <i className={`fa-solid ${sectorInfo?.icon}`} style={{ color: getTierColor(selectedSector) }}></i>
                    {sectorInfo?.name.toUpperCase()}
                  </h2>
                  <div className="text-[10px] text-blue-300/70 font-mono uppercase tracking-[0.2em]">Datacenter Management System v2.0</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-[10px] text-blue-400 uppercase tracking-widest">Status do Setor</div>
                  <div className="text-white font-mono font-bold flex items-center gap-2 justify-end">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    ONLINE
                  </div>
                </div>
                <div className="h-8 w-[1px] bg-blue-500/30"></div>
                <div className="text-right">
                  <div className="text-[10px] text-blue-400 uppercase tracking-widest">Quartos Ativos</div>
                  <div className="text-xl font-mono font-bold text-white">{sectorRooms.length}</div>
                </div>
              </div>
            </div>

            {canPayAll && (
              <div className="mb-8 flex justify-center">
                <button
                  onClick={() => onPayAllEnergy(selectedSector)}
                  className="bg-gradient-to-r from-neon-yellow/90 to-neon-orange/90 text-black px-8 py-3 rounded-lg text-sm font-bold uppercase hover:shadow-[0_0_30px_rgba(255,193,7,0.4)] transition-all flex items-center gap-3 border border-neon-yellow backdrop-blur-sm"
                >
                  <i className="fa-solid fa-bolt text-lg animate-pulse"></i>
                  RESTAURAR ENERGIA DO SETOR ({roomsNeedingEnergy.length})
                  <span className="ml-2 bg-black/40 px-3 py-1 rounded text-white font-mono">Ð {totalEnergyCost.toFixed(2)}</span>
                </button>
              </div>
            )}

            <div className="flex flex-col gap-6">
              {/* Rooms in this sector */}
              {sectorRooms.length === 0 ? (
                <div className="border-2 border-dashed border-[#444] rounded-lg min-w-[200px] h-[200px] flex flex-col items-center justify-center text-[#555]">
                  <i className="fa-solid fa-building text-[40px] mb-2.5"></i>
                  <div>Nenhum quarto neste setor</div>
                </div>
              ) : (
                sectorRooms.map((room) => {
                  const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
                  if (!dbRoom) return null
                  const shelves = inventory.filter((i) => i.parentId === room.uid)
                  const isPowerOff = room.power === false

                  let roomPower = 0,
                    roomDaily = 0,
                    roomWatts = 0
                  shelves.forEach((shelf) => {
                    inventory
                      .filter((m) => m.parentId === shelf.uid)
                      .forEach((miner) => {
                        const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
                        if (dbMiner && (miner.health ?? 100) > 0) {
                          roomPower += dbMiner.power || 0
                          roomDaily += dbMiner.daily || 0
                          roomWatts += Math.floor((dbMiner.power || 0) * 0.8)
                        }
                      })
                  })

                  const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
                  const percentage = Math.max(0, Math.min(100, (timeLeft / RENT_DURATION_MS) * 100))
                  const hoursLeft = Math.floor(Math.max(0, timeLeft) / 3600000)
                  const minsLeft = Math.floor((Math.max(0, timeLeft) % 3600000) / 60000)
                  const barColor = percentage < 10 ? "#ff5252" : percentage < 30 ? "#ffea00" : "#00e676"
                  const allowedAuto = ["rare", "epic", "legendary"].includes(dbRoom.tier)

                  return (
                    <div
                      key={room.uid}
                      className={`bg-[#0f1016]/90 border border-blue-500/20 rounded-2xl overflow-hidden relative shadow-2xl transition-all backdrop-blur-md group ${isPowerOff ? "grayscale brightness-[0.4] border-red-500/30" : "hover:border-blue-500/40"}`}
                    >
                      {/* Room Header / HUD */}
                      <div className="bg-black/40 p-4 border-b border-white/5 grid grid-cols-[1fr_max-content] gap-5 items-center z-10 relative">
                        <div className="flex flex-col gap-2">
                          <div className="font-bold text-white text-lg flex items-center gap-3 whitespace-nowrap font-mono tracking-wide">
                            <div className={`w-3 h-3 rounded-full ${isPowerOff ? "bg-red-500" : "bg-green-500 animate-pulse"} shadow-[0_0_10px_currentColor]`}></div>
                            <span style={{ color: getTierColor(dbRoom.tier) }}>{dbRoom.name.toUpperCase()}</span>
                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded border border-white/10 text-[#888]">{room.uid.slice(0, 8)}</span>
                            {isPowerOff && <span className="text-neon-red text-xs font-bold animate-pulse">⚠ POWER LOSS</span>}
                          </div>

                          {/* Holographic Stats */}
                          <div className="flex gap-4 items-center text-xs font-mono">
                            <div className="flex items-center gap-2 text-blue-300">
                              <i className="fa-solid fa-bolt"></i>
                              <span>{roomPower.toFixed(0)} MH/s</span>
                            </div>
                            <div className="w-[1px] h-3 bg-white/10"></div>
                            <div className="flex items-center gap-2 text-green-400">
                              <i className="fa-solid fa-coins"></i>
                              <span>{roomDaily.toFixed(2)} Ð/dia</span>
                            </div>
                            <div className="w-[1px] h-3 bg-white/10"></div>
                            <div className="flex items-center gap-2 text-orange-400">
                              <i className="fa-solid fa-plug"></i>
                              <span>{roomWatts.toFixed(0)} W</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 w-full">
                          {timeLeft > 0 ? (
                            <>
                              <div className="flex items-center gap-3">
                                {/* Auto Pay Switch */}
                                <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded-full border border-white/5">
                                  <span className={`text-[10px] font-bold uppercase ${!allowedAuto ? "text-[#444]" : "text-[#888]"}`}>Auto-Pay</span>
                                  {allowedAuto ? (
                                    <div className="relative inline-block w-[30px] h-[16px]">
                                      <input
                                        type="checkbox"
                                        checked={!!room.autoPay}
                                        onChange={() => onToggleAutoPay(room.uid)}
                                        className="opacity-0 w-0 h-0 peer absolute z-20 cursor-pointer"
                                      />
                                      <span className="absolute cursor-pointer inset-0 bg-[#222] transition-all rounded-full border border-[#444] before:absolute before:content-[''] before:h-[10px] before:w-[10px] before:left-[2px] before:bottom-[2px] before:bg-white before:transition-all before:rounded-full peer-checked:bg-neon-green peer-checked:border-neon-green peer-checked:before:translate-x-[14px] peer-checked:before:bg-black"></span>
                                    </div>
                                  ) : (
                                    <i className="fa-solid fa-lock text-[10px] text-[#444]"></i>
                                  )}
                                </div>

                                <button
                                  onClick={() => onPayRent(room.uid)}
                                  className="bg-neon-orange/10 border border-neon-orange/50 text-neon-orange px-4 py-1.5 rounded text-[10px] font-bold uppercase hover:bg-neon-orange hover:text-black transition-all shadow-[0_0_10px_rgba(255,145,0,0.1)] flex items-center gap-2 whitespace-nowrap"
                                >
                                  <i className="fa-solid fa-bolt"></i> Recarregar
                                </button>
                              </div>

                              <div className="flex items-center gap-2 w-full justify-end">
                                <div className="text-[10px] text-blue-300 font-mono">
                                  {hoursLeft}h {String(minsLeft).padStart(2, "0")}m
                                </div>
                                <div className="w-[100px] h-[4px] bg-[#222] rounded-full overflow-hidden relative">
                                  <div
                                    className="h-full transition-all duration-300 shadow-[0_0_10px_currentColor]"
                                    style={{ width: `${percentage}%`, background: barColor }}
                                  ></div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <button
                              onClick={() => onPayRent(room.uid)}
                              className="bg-neon-red text-white border-none px-6 py-2 rounded text-xs font-bold cursor-pointer animate-pulse-red uppercase w-full whitespace-nowrap shadow-[0_0_20px_rgba(255,0,0,0.4)]"
                            >
                              ⚠ SYSTEM FAILURE: RESTORE POWER
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Racks Container */}
                      <div
                        className={`p-6 flex gap-6 overflow-x-auto min-h-[320px] relative z-[1] items-end theme-${dbRoom.tier} scrollbar-thin scrollbar-thumb-blue-500/20 scrollbar-track-black/20`}
                      >
                        {/* Shelves as Server Racks */}
                        {[...Array(dbRoom.slots || 1)].map((_, i) => {
                          const shelf = shelves[i]
                          if (shelf) {
                            const dbShelf = ITEMS_DB.shelf.find((x) => x.id === shelf.id)
                            if (!dbShelf) return null
                            const minersInShelf = inventory.filter((m) => m.parentId === shelf.uid)
                            return (
                              <div
                                key={shelf.uid}
                                className="min-w-[260px] bg-[#12131a] border border-[#333] rounded-lg flex flex-col shadow-2xl relative z-[2] shrink-0 group/rack"
                              >
                                {/* Rack Header */}
                                <div
                                  className="px-3 py-2 bg-[#0a0b10] border-b border-[#333] text-[10px] text-[#888] font-bold flex justify-between items-center rounded-t-lg"
                                  style={{ borderTop: `2px solid ${getTierColor(dbShelf.tier)}` }}
                                >
                                  <span className="font-mono tracking-wider">{dbShelf.name.toUpperCase()}</span>
                                  <div className="flex gap-2">
                                    <div className="flex gap-0.5">
                                      <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></div>
                                      <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse delay-75"></div>
                                      <div className="w-1 h-1 rounded-full bg-orange-500 animate-pulse delay-150"></div>
                                    </div>
                                    <Tooltip text="Desmontar Rack">
                                      <i
                                        onClick={() => onUninstall(shelf.uid)}
                                        className="fa-solid fa-xmark text-red-500 cursor-pointer hover:text-red-400 transition-colors"
                                      ></i>
                                    </Tooltip>
                                  </div>
                                </div>

                                {/* Rack Body (Rails) */}
                                <div className="p-2 flex flex-col gap-1 grow bg-[#050508] relative overflow-hidden">
                                  {/* Rail holes visual */}
                                  <div className="absolute left-1 top-0 bottom-0 w-[2px] border-l border-dashed border-[#222]"></div>
                                  <div className="absolute right-1 top-0 bottom-0 w-[2px] border-r border-dashed border-[#222]"></div>

                                  {[...Array(dbShelf.slots || 1)].map((__, j) => {
                                    const miner = minersInShelf[j]
                                    if (miner) {
                                      const dbMiner = ITEMS_DB.miner.find((x) => x.id === miner.id)
                                      const styleClass = dbMiner?.skinStyle ? `style-${dbMiner.skinStyle}` : ""
                                      const tierColor = getTierColor(dbMiner?.tier || "basic")
                                      const health = miner.health ?? 100
                                      const isBroken = health <= 0

                                      const healthColor =
                                        health > 50 ? "bg-green-500" : health > 20 ? "bg-yellow-500" : "bg-red-600"

                                      const specs = MINER_SPECS[dbMiner?.tier || "basic"]

                                      return (
                                        <div
                                          key={miner.uid}
                                          className={`h-[42px] border border-[#333] bg-gradient-to-r from-[#222] to-[#1a1a20] flex flex-col justify-between px-2 py-1 cursor-default shadow-inner rounded-sm relative ${styleClass} ${isBroken ? "grayscale brightness-50" : ""}`}
                                          style={{ borderLeft: `3px solid ${tierColor}` }}
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                              {/* Status LED */}
                                              <div className={`w-1.5 h-1.5 rounded-full ${isBroken ? "bg-red-500" : isPowerOff ? "bg-gray-600" : "bg-green-500 animate-pulse"} shadow-[0_0_5px_currentColor]`}></div>

                                              <div
                                                className="w-[16px] h-[16px] rounded-full bg-black border border-[#444] relative slot-fan-mini flex items-center justify-center"
                                                style={{ borderColor: tierColor }}
                                              >
                                                {!isPowerOff && !isBroken && (
                                                  <div className="w-full h-full rounded-full fan-blades-gradient opacity-60 animate-spin-fast"></div>
                                                )}
                                              </div>
                                              <span
                                                className="font-bold text-[10px]"
                                                style={{ color: isBroken ? "#666" : tierColor }}
                                              >
                                                {dbMiner?.name}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Tooltip
                                                text={
                                                  isBroken
                                                    ? "CRÍTICO: Superaquecimento! (95°C)"
                                                    : `Temp: ${(90 - (health * 0.5)).toFixed(1)}°C | Saúde: ${health.toFixed(0)}% | Prod: ${specs?.daily.toFixed(2)} Ð/dia`
                                                }
                                              >
                                                <div className="flex items-center gap-1">
                                                  <i
                                                    className={`fa-solid fa-temperature-${isBroken ? "full" : health > 50 ? "low" : health > 20 ? "half" : "high"} text-[10px]`}
                                                    style={{
                                                      color: isBroken
                                                        ? "#ff5252"
                                                        : health > 50
                                                          ? "#00e676"
                                                          : health > 20
                                                            ? "#ffea00"
                                                            : "#ff5252",
                                                    }}
                                                  ></i>
                                                  <span
                                                    className="text-[9px] font-mono font-bold"
                                                    style={{
                                                      color: isBroken
                                                        ? "#ff5252"
                                                        : health > 50
                                                          ? "#00e676"
                                                          : health > 20
                                                            ? "#ffea00"
                                                            : "#ff5252",
                                                    }}
                                                  >
                                                    {(90 - (health * 0.5)).toFixed(0)}°C
                                                  </span>
                                                </div>
                                              </Tooltip>
                                              <Tooltip text="Remover mineradora">
                                                <i
                                                  onClick={() => onUninstall(miner.uid)}
                                                  className="fa-solid fa-trash text-neon-red cursor-pointer text-[10px] opacity-40 hover:opacity-100 hover:scale-110 transition-all"
                                                ></i>
                                              </Tooltip>
                                            </div>
                                          </div>

                                          <div className="w-full h-[3px] bg-black/50 rounded-full overflow-hidden mt-0.5">
                                            <div
                                              className={`h-full transition-all duration-300 ${healthColor}`}
                                              style={{ width: `${health}%` }}
                                            ></div>
                                          </div>

                                          {isBroken && (
                                            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 rounded-sm">
                                              <button
                                                onClick={() => onRepairMiner(miner.uid)}
                                                className="bg-neon-orange text-black text-[9px] font-bold px-2 py-1 rounded uppercase hover:bg-orange-400 transition-all flex items-center gap-1"
                                              >
                                                <i className="fa-solid fa-wrench"></i> MANUTENÇÃO (Ð 50)
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    } else {
                                      return (
                                        <Tooltip key={j} text="Instalar Módulo de Mineração">
                                          <div
                                            onClick={() => onInstall("miner", shelf.uid)}
                                            className="h-[42px] border border-dashed border-[#222] bg-[#0a0b10] rounded-sm flex items-center justify-center text-[10px] text-[#333] cursor-pointer hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5 transition-all group/empty"
                                          >
                                            <span className="group-hover/empty:scale-110 transition-transform font-mono uppercase tracking-wider flex items-center gap-2">
                                              <i className="fa-solid fa-plus"></i> Empty Slot
                                            </span>
                                          </div>
                                        </Tooltip>
                                      )
                                    }
                                  })}
                                </div>
                              </div>
                            )
                          } else {
                            return (
                              <Tooltip key={i} text="Instalar Rack de Servidor">
                                <div
                                  onClick={() => onInstall("shelf", room.uid)}
                                  className="border border-dashed border-[#333] bg-[#0a0b10]/50 rounded-lg min-w-[260px] h-[300px] flex flex-col items-center justify-center text-[#444] cursor-pointer hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5 shrink-0 transition-all group/rack-empty backdrop-blur-sm"
                                >
                                  <div className="w-16 h-16 rounded-full border border-[#333] flex items-center justify-center mb-4 group-hover/rack-empty:border-blue-500 group-hover/rack-empty:shadow-[0_0_20px_rgba(59,130,246,0.2)] transition-all">
                                    <i className="fa-solid fa-server text-2xl"></i>
                                  </div>
                                  <div className="font-mono uppercase tracking-widest text-xs">Instalar Rack</div>
                                </div>
                              </Tooltip>
                            )
                          }
                        })}
                      </div>

                      {/* Footer Actions */}
                      <div className="bg-[#050508] border-t border-[#222] px-4 py-2 flex justify-between items-center">
                        <div className="text-[10px] text-[#444] font-mono uppercase">
                          Rack Capacity: {shelves.length}/{dbRoom.slots || 1}
                        </div>
                        <Tooltip
                          text={
                            shelves.length > 0 ? "Remova todos os racks primeiro" : "Vender este Datacenter por Ð 8.00"
                          }
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onDemolishRoom(room.uid)
                            }}
                            disabled={shelves.length > 0}
                            className={`flex items-center gap-2 px-3 py-1 rounded text-[9px] font-bold uppercase transition-all ${shelves.length > 0
                              ? "text-[#333] cursor-not-allowed"
                              : "text-red-500 hover:bg-red-900/20"
                              }`}
                          >
                            <i className="fa-solid fa-trash-can"></i>
                            Demolir
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )
    }

    // Overview: Show sector cards
    return (
      <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">Gestão de Infraestrutura</h2>
            <div className="text-xs text-[#888] font-mono uppercase tracking-widest">Selecione um setor para gerenciar</div>
          </div>
        </div>

        {rooms.length === 0 ? (
          <div
            onClick={() => {
              setShopFilter("room")
              setActiveView("shop")
            }}
            className="border-2 border-dashed border-[#333] rounded-2xl min-w-[200px] h-[300px] flex flex-col items-center justify-center text-[#555] cursor-pointer hover:border-blue-500 hover:text-blue-400 hover:bg-blue-500/5 transition-all group"
          >
            <div className="w-20 h-20 rounded-full bg-[#111] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <i className="fa-solid fa-plus text-3xl"></i>
            </div>
            <div className="font-mono uppercase tracking-wider">Iniciar Operação</div>
            <div className="text-xs text-[#444] mt-2">Comprar primeiro quarto</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sectors.map((sector) => {
              const count = roomsBySector[sector.tier]?.length || 0
              const isInactive = count === 0
              const lowEnergy = hasLowEnergy(sector.tier)
              const brokenMiners = hasBrokenMiners(sector.tier)

              return (
                <div
                  key={sector.tier}
                  onClick={() => !isInactive && setSelectedSector(sector.tier)}
                  className={`relative bg-[#151621] border rounded-2xl p-6 transition-all duration-300 group overflow-hidden ${isInactive
                    ? "border-[#222] opacity-50 cursor-not-allowed"
                    : "border-[#333] hover:border-blue-500/50 hover:shadow-[0_0_30px_rgba(0,0,0,0.5)] cursor-pointer hover:-translate-y-1"
                    }`}
                >
                  {/* Background Glow */}
                  {!isInactive && (
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/10 rounded-full blur-[50px] group-hover:bg-blue-500/20 transition-all"></div>
                  )}

                  {/* Alert indicators */}
                  {!isInactive && (lowEnergy || brokenMiners) && (
                    <div className="absolute top-4 right-4 flex gap-2 z-10">
                      {lowEnergy && (
                        <Tooltip text="Energia baixa em alguns quartos!">
                          <div className="w-2 h-2 bg-neon-red rounded-full animate-pulse-red shadow-[0_0_10px_red]"></div>
                        </Tooltip>
                      )}
                      {brokenMiners && (
                        <Tooltip text="Mineradoras quebradas neste setor!">
                          <div className="w-2 h-2 bg-neon-orange rounded-full animate-pulse shadow-[0_0_10px_orange]"></div>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  {/* Icon */}
                  <div className="flex items-center justify-center mb-6 relative z-10">
                    <div
                      className="w-24 h-24 rounded-2xl flex items-center justify-center rotate-3 group-hover:rotate-0 transition-all duration-300 shadow-xl"
                      style={{
                        background: isInactive
                          ? "#1a1b26"
                          : `linear-gradient(135deg, ${getTierColor(sector.tier)}20, ${getTierColor(sector.tier)}05)`,
                        border: `1px solid ${isInactive ? "#333" : getTierColor(sector.tier)}40`,
                      }}
                    >
                      <i
                        className={`fa-solid ${sector.icon} text-4xl drop-shadow-lg`}
                        style={{ color: isInactive ? "#444" : getTierColor(sector.tier) }}
                      ></i>
                    </div>
                  </div>

                  {/* Title */}
                  <h3
                    className="text-xl font-bold text-center mb-1 font-mono tracking-wide"
                    style={{ color: isInactive ? "#666" : "white" }}
                  >
                    {sector.name}
                  </h3>
                  <div className="text-center text-[10px] text-[#666] uppercase tracking-widest mb-6 font-mono">
                    Sector {sector.tier.toUpperCase()}
                  </div>

                  {/* Counter */}
                  <div className="text-center">
                    {isInactive ? (
                      <div className="inline-block px-3 py-1 rounded bg-[#111] text-xs text-[#444] font-mono border border-[#222]">BLOQUEADO</div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-2xl font-bold text-white font-mono">{count}</span>
                        <span className="text-xs text-[#888] uppercase">Datacenters</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  },
)

// --- BOX OPENING ANIMATION COMPONENT ---
const BoxOpeningModal = React.memo(
  ({ wonItem, tier, onClose }: { wonItem: DBItem; tier: Tier; onClose: () => void }) => {
    const [stage, setStage] = useState<"intro" | "shaking" | "violent" | "opening" | "reveal">("intro")
    const [flash, setFlash] = useState(false)

    useEffect(() => {
      const s1 = setTimeout(() => setStage("shaking"), 600)
      const s2 = setTimeout(() => setStage("violent"), 1600)
      const s3 = setTimeout(() => setStage("opening"), 2400) // New stage: rapid expansion
      const s4 = setTimeout(() => setFlash(true), 2600) // Flash starts
      const s5 = setTimeout(() => {
        setStage("reveal")
      }, 2700) // Content switch

      return () => {
        clearTimeout(s1)
        clearTimeout(s2)
        clearTimeout(s3)
        clearTimeout(s4)
        clearTimeout(s5)
      }
    }, [])

    return (
      <div className="fixed inset-0 bg-black/95 z-[3000] flex flex-col items-center justify-center">
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Flash Overlay */}
          <div
            className={`fixed inset-0 bg-white z-[3001] pointer-events-none transition-opacity duration-[1500ms] ease-out ${flash ? "opacity-0" : "opacity-0 hidden"}`}
            style={flash ? { animation: "flashBang 0.8s forwards" } : {}}
          ></div>

          {/* STAGE 1-3: THE BOX */}
          {stage !== "reveal" && (
            <div className="relative flex items-center justify-center">
              {/* Glow behind box */}
              <div
                className={`absolute w-[200px] h-[200px] rounded-full bg-tier-box blur-[80px] transition-all duration-500
                            ${stage === "intro" ? "opacity-20 scale-75" : ""}
                            ${stage === "shaking" ? "opacity-40 scale-100" : ""}
                            ${stage === "violent" ? "opacity-80 scale-150 animate-pulse" : ""}
                            ${stage === "opening" ? "opacity-100 scale-[5] duration-200" : ""}
                        `}
              ></div>

              <div
                className={`text-[120px] text-tier-box drop-shadow-[0_0_50px_rgba(255,179,0,0.6)] transition-all duration-300 z-10
                            ${stage === "intro" ? "animate-float" : ""}
                            ${stage === "shaking" ? "animate-shake" : ""}
                            ${stage === "violent" ? "animate-violent-shake" : ""}
                            ${stage === "opening" ? "scale-[3] opacity-0 duration-300 rotate-12" : ""}
                        `}
              >
                <i className="fa-solid fa-cube"></i>
              </div>
            </div>
          )}

          {/* STAGE 4: THE REVEAL */}
          {stage === "reveal" && (
            <div className="relative z-[3002] animate-card-pop">
              {/* Rotating Rays */}
              <div
                className="absolute top-1/2 left-1/2 w-[1000px] h-[1000px] -translate-x-1/2 -translate-y-1/2 opacity-30 rounded-full blur-3xl z-[-1] animate-rays-spin"
                style={{
                  background: `conic-gradient(from 0deg, transparent 0%, ${getTierColor(tier)} 10%, transparent 20%, ${getTierColor(tier)} 30%, transparent 40%, ${getTierColor(tier)} 50%, transparent 60%, ${getTierColor(tier)} 70%, transparent 80%, ${getTierColor(tier)} 90%, transparent 100%)`,
                }}
              ></div>

              {/* Card */}
              <div className="flex flex-col w-[300px] bg-gradient-to-br from-[#1a1a20] to-[#0d0e15] border border-[#333] rounded-2xl p-[2px] shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
                <div className="h-[6px] w-full rounded-t-xl" style={{ background: getTierColor(tier) }}></div>
                <div className="p-8 flex flex-col items-center text-center relative bg-black/20 backdrop-blur-sm">
                  {/* Inner Glow */}
                  <div
                    className="absolute top-[50px] left-1/2 -translate-x-1/2 w-[150px] h-[150px] blur-xl pointer-events-none opacity-60"
                    style={{ background: `radial-gradient(circle, ${getTierColor(tier)} 0%, transparent 70%)` }}
                  ></div>

                  <i
                    className={`fa-solid ${wonItem.type === "miner" ? "fa-microchip" : wonItem.type === "shelf" ? "fa-layer-group" : "fa-server"} text-[80px] mb-6 relative z-[2] drop-shadow-2xl`}
                    style={{ color: getTierColor(tier) }}
                  ></i>

                  <div className="text-xl font-extrabold text-white uppercase tracking-widest mb-2 relative z-[2] leading-tight">
                    {wonItem.name}
                  </div>
                  <div className="text-[10px] text-[#888] mb-6 relative z-[2]">
                    {wonItem.desc || getTierLabel(tier)}
                  </div>

                  <div
                    className="text-[11px] font-mono bg-black/60 text-white px-4 py-1.5 rounded-xl border border-[#555] mb-8 uppercase font-bold shadow-md relative z-[2]"
                    style={{ color: getTierColor(tier), borderColor: getTierColor(tier) }}
                  >
                    {tier}
                  </div>

                  <button
                    onClick={onClose}
                    className="bg-white text-black border-none py-3.5 w-full rounded-lg font-bold text-sm cursor-pointer shadow-lg uppercase relative z-[3] hover:-translate-y-1 hover:shadow-xl transition-all hover:bg-gray-100 active:scale-95"
                  >
                    COLETAR
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  },
)

// --- BANK MODAL COMPONENT ---
const BankModal = React.memo(
  ({
    type,
    balance,
    createdAt,
    onClose,
    onConfirm,
  }: {
    type: "deposit" | "withdraw"
    balance: number
    createdAt: number
    onClose: () => void
    onConfirm: (amount: number) => void
  }) => {
    const [val, setVal] = useState("")
    const amount = Number.parseFloat(val) || 0

    const feeInfo = getWithdrawFee(createdAt)
    const fee = type === "withdraw" ? amount * feeInfo.rate : 0
    const netAmount = Math.max(0, amount - fee)

    const handleConfirm = () => {
      if (amount <= 0) return
      onConfirm(amount)
    }

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
        <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[400px] shadow-2xl relative">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <i
              className={`fa-solid ${type === "deposit" ? "fa-arrow-up-from-bracket" : "fa-money-bill-wave"} ${type === "deposit" ? "text-neon-green" : "text-neon-red"}`}
            ></i>
            {type === "deposit" ? "Depositar (Compra DPIX)" : "Sacar BRL"}
          </h3>

          <div className="mb-4">
            <label className="text-xs text-[#888] uppercase block mb-1">
              Valor {type === "deposit" ? "do Pagamento" : "do Saque"}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-[#666] font-bold text-sm">R$</span>
              <input
                type="number"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                step="0.01"
                min="0"
                className="w-full bg-[#111] border border-[#333] rounded-lg py-2 pl-10 pr-3 text-white font-bold font-mono focus:border-accent outline-none transition-colors text-base"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="text-[11px] text-[#666] mt-1.5 text-right">
              Saldo Disponível: <span className="text-white font-bold">{formatBRL(balance)}</span>
            </div>
          </div>

          {type === "withdraw" && amount > 0 && (
            <div className="bg-[#151621] border border-[#333] rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1 text-[11px] text-[#aaa]">
                <span>Taxa de Fidelidade ({feeInfo.label})</span>
                <span className="text-neon-red font-mono">{formatBRL(fee)}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-[#333]">
                <span className="text-white">Total a Receber</span>
                <span className="text-neon-green font-mono text-lg">{formatBRL(netAmount)}</span>
              </div>
            </div>
          )}

          {type === "deposit" && amount > 0 && (
            <>
              <div className="bg-[#151621] border border-[#333] rounded-lg p-3 mb-4 text-sm">
                <div className="flex justify-between font-bold items-center">
                  <span className="text-white text-xs">Receber em DPIX</span>
                  <span className="text-dpix-color text-xl font-mono">{amount.toFixed(2)} Ð</span>
                </div>
                <div className="text-[10px] text-[#666] text-right mt-1.5">
                  Taxa de Câmbio: <span className="text-white font-bold">1 BRL = 1 DPIX</span>
                </div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg mb-4 flex gap-3 items-start">
                <i className="fa-solid fa-circle-info text-blue-400 mt-0.5 text-sm"></i>
                <div className="text-[11px] text-blue-200 leading-relaxed">
                  Depósitos em dinheiro são <strong className="text-blue-100">convertidos instantaneamente</strong> para
                  DPIX (moeda do jogo) para uso no Mercado.
                </div>
              </div>
            </>
          )}

          {type === "withdraw" && amount > balance && (
            <div className="text-neon-red text-xs mb-4 text-center font-bold">Saldo Insuficiente</div>
          )}

          <div className="flex justify-end gap-2.5">
            <button
              onClick={onClose}
              className="bg-transparent border border-[#555] text-[#aaa] px-4 py-2 rounded-lg text-xs font-bold hover:bg-white hover:text-black transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={amount <= 0 || (type === "withdraw" && amount > balance)}
              className={`border-none px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${type === "deposit" ? "bg-neon-green text-black hover:bg-green-400" : "bg-neon-red text-white hover:bg-red-600"} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    )
  },
)

// --- RANKING VIEW COMPONENT ---
const RankingView = ({ leaderboard, userRank, userNetWorth }: { leaderboard: any[], userRank: number, userNetWorth: number }) => {
  return (
    <div className="p-8 animate-slide-in max-w-5xl mx-auto w-full pb-20">

      {/* Monthly Reward Banner */}
      <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl border border-[#333] relative group">
        <div className="absolute inset-0 bg-gradient-to-t from-[#151621] via-transparent to-transparent opacity-60"></div>
        <img src="/ranking-banner-final.png" alt="Premiação Mensal Ranking" className="w-full h-auto object-cover" />
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <i className="fa-solid fa-trophy text-neon-yellow"></i> Ranking Global
          </h2>
          <p className="text-sm text-[#888] mt-1">
            Os maiores magnatas da mineração. Classificação baseada em Patrimônio Total.
          </p>
        </div>
        <div className="bg-[#1a1a2e] border border-accent/30 px-6 py-3 rounded-xl flex items-center gap-4">
          <div>
            <div className="text-[10px] text-[#888] uppercase tracking-wider font-bold">Sua Posição</div>
            <div className="text-2xl font-bold text-white font-mono">#{userRank}</div>
          </div>
          <div className="h-8 w-[1px] bg-[#333]"></div>
          <div>
            <div className="text-[10px] text-[#888] uppercase tracking-wider font-bold">Seu Patrimônio</div>
            <div className="text-xl font-bold text-neon-green font-mono">{formatBRL(userNetWorth)}</div>
          </div>
        </div>
      </div>

      <div className="bg-[#151621] border border-[#333] rounded-xl overflow-hidden shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1a1a2e] text-[#888] text-xs uppercase tracking-wider border-b border-[#333]">
              <th className="p-4 font-bold text-center w-[80px]">#</th>
              <th className="p-4 font-bold">Gestor</th>
              <th className="p-4 font-bold text-right">Poder (MH/s)</th>
              <th className="p-4 font-bold text-right">Patrimônio</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((player, index) => {
              const rank = index + 1
              const isTop3 = rank <= 3

              return (
                <tr
                  key={player.id}
                  className={`border-b border-[#222] transition-colors ${player.isUser ? "bg-accent/10 border-accent/30 hover:bg-accent/20" : "hover:bg-white/5"}`}
                >
                  <td className="p-4 text-center">
                    {rank === 1 && <i className="fa-solid fa-trophy text-yellow-400 text-lg"></i>}
                    {rank === 2 && <i className="fa-solid fa-trophy text-gray-400 text-lg"></i>}
                    {rank === 3 && <i className="fa-solid fa-trophy text-amber-700 text-lg"></i>}
                    {rank > 3 && <span className={`font-mono font-bold ${player.isUser ? "text-white" : "text-[#666]"}`}>#{rank}</span>}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${player.isUser ? "bg-accent text-white" : "bg-[#222] text-[#666]"}`}>
                        {player.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className={`font-bold ${player.isUser ? "text-white" : "text-[#aaa]"}`}>
                        {player.name} {player.isUser && <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded text-white ml-2">VOCÊ</span>}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-blue-400">
                    {player.power} MH/s
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-neon-green">
                    {formatBRL(player.netWorth)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- MAIN COMPONENT ---
const App: React.FC = () => {
  // Default State (Starter Kit)
  const defaultState: GameState = {
    wallet: 0.0,
    dpix: 0.0,
    miningPool: 0.0,
    inventory: [
      {
        uid: "room-init-1",
        id: "room_basic",
        type: "room",
        tier: "basic",
        power: true,
        lastRentPaid: Date.now(),
      },
      {
        uid: "shelf-init-1",
        id: "shelf_basic",
        type: "shelf",
        tier: "basic",
        parentId: "room-init-1",
      },
    ],
    logs: [],
    username: "CEO",
    createdAt: Date.now(),
    referral: {
      code: "USER-" + Math.floor(Math.random() * 90000 + 10000),
      users: { lvl1: 0, lvl2: 0, lvl3: 0 },
      balance: 0.0,
      totalEarned: 0.0,
    },
  }

  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem("0xminer_v1")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Fix potential miner health issues on load
        if (parsed.inventory) {
          parsed.inventory = parsed.inventory.map((item: InventoryItem) => {
            if (item.type === "miner" && item.health === undefined) {
              return { ...item, health: 100, lastHealthUpdate: Date.now() }
            }
            return item
          })
        }
        return { ...defaultState, ...parsed }
      } catch (e) {
        return defaultState
      }
    }
    return defaultState
  })

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem("0xminer_v1", JSON.stringify(state))
  }, [state])

  // --- STATE DECLARATIONS ---
  const [exchangeConfirmModal, setExchangeConfirmModal] = useState<{
    open: boolean
    type: "dpixToBrl" | "brlToDpix"
    amount: number
    fee: number
    netReceive: number
  } | null>(null)
  // Added state for exchange buy amount in the main view
  const [exchangeAmount, setExchangeAmount] = useState("")
  const [sellAmount, setSellAmount] = useState("")
  const [buyAmount, setBuyAmount] = useState("")
  const [exchangeDirection, setExchangeDirection] = useState<"dpixToBrl" | "brlToDpix">("dpixToBrl")

  const [exchangeModal, setExchangeModal] = useState<{ open: boolean; mode: "dpix-to-brl" | "brl-to-dpix" | null }>({
    open: false,
    mode: null,
  })

  // NEW: Buy Confirmation Modal State
  const [buyConfirmModal, setBuyConfirmModal] = useState<{ show: boolean, item: DBItem | null, type: string | null } | null>(null)

  // NEW: Mobile Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // NEW: Inventory Action Modals
  const [recycleModal, setRecycleModal] = useState<{ show: boolean; items: string[]; totalValue: number } | null>(null)
  const [repairModal, setRepairModal] = useState<{ show: boolean; items: string[]; totalCost: number } | null>(null)

  // Notification for demolishRoom
  const [demolishModal, setDemolishModal] = useState<{
    roomUid: string
    roomName: string
    show: boolean
  } | null>(null)

  const [notification, setNotification] = useState<{ message: string; color: "red" | "green" | "blue" } | null>(null)

  // Save Indicator State
  const [isSaving, setIsSaving] = useState(false)

  const notify = useCallback((msg: string, type: "success" | "error" | "info") => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])


  const addLog = useCallback((desc: string, amount: number | string, type: "in" | "out" | "coin") => {
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, { id: Date.now(), date: new Date().toLocaleString("pt-BR"), desc, amount, type }],
    }))
  }, [])

  const getScrapValue = useCallback((itemType: string): number => {
    switch (itemType) {
      case "miner":
        return 20
      case "room":
        return 8
      case "shelf":
        return 4
      default:
        return 0
    }
  }, [])

  // Function to demolish a room
  const demolishRoom = useCallback(
    (roomUid: string) => {
      const room = state.inventory.find((i) => i.uid === roomUid && i.type === "room") // Changed category to type for consistency
      if (!room) return

      const shelves = state.inventory.filter((i) => i.parentId === roomUid)

      // Validation: cannot demolish if there are shelves
      if (shelves.length > 0) {
        setNotification({
          message: "Remova todas as prateleiras antes de demolir o quarto.",
          color: "red",
        })
        return
      }

      const roomData = ITEMS_DB.room.find((r) => r.id === room.id)
      const roomName = roomData?.name || "Quarto"

      // Open confirmation modal
      setDemolishModal({
        roomUid,
        roomName,
        show: true,
      })
    },
    [state.inventory, setState, setNotification], // Added dependencies
  )

  const confirmDemolish = useCallback(() => {
    if (!demolishModal) return

    // Remove the room from inventory
    setState((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((i) => i.uid !== demolishModal.roomUid),
      dpix: prev.dpix + 8.0,
    }))

    setNotification({
      message: `${demolishModal.roomName} demolido! +Ð 8.00`,
      color: "green",
    })

    setDemolishModal(null)
  }, [demolishModal, setState, setNotification])

  const recycleItem = useCallback(
    (uid: string) => {
      const item = state.inventory.find((i) => i.uid === uid)
      if (!item) return

      if (item.parentId) {
        notify("Remova o item antes de reciclar.", "error")
        return
      }

      const dbItem = ITEMS_DB[item.type]?.find((x) => x.id === item.id)
      if (!dbItem) return

      const scrapValue = getScrapValue(item.type)

      const confirmed = window.confirm(
        `Tem certeza? Você vai vender "${dbItem.name}" como sucata por Ð ${scrapValue.toFixed(2)}.\n\nEsta ação não pode ser desfeita.`,
      )

      if (!confirmed) return

      setState((prev) => ({
        ...prev,
        inventory: prev.inventory.filter((i) => i.uid !== uid),
        dpix: prev.dpix + scrapValue,
      }))

      notify(`Item reciclado! +Ð ${scrapValue.toFixed(2)} adicionados.`, "success")
    },
    [state.inventory, notify, getScrapValue],
  )

  const handleLogout = useCallback(() => {
    if (window.confirm("Tem certeza que deseja sair?")) {
      window.location.reload()
    }
  }, [])

  // --- INITIALIZATION ---
  useEffect(() => {
    // Initialization logic if needed
  }, [])



  // --- STARTER KIT INJECTION (Self-Healing) ---
  useEffect(() => {
    const hasRoom = state.inventory.some(i => i.type === "room")
    if (!hasRoom) {
      const roomUid = "uid_" + Date.now() + "_starter_room"
      const shelfUid = "uid_" + Date.now() + "_starter_shelf"

      setState(prev => ({
        ...prev,
        inventory: [
          ...prev.inventory,
          {
            uid: roomUid,
            id: "room_basic",
            type: "room",
            tier: "basic",
            power: true,
            lastRentPaid: Date.now(),
          },
          {
            uid: shelfUid,
            id: "shelf_basic",
            type: "shelf",
            tier: "basic",
            parentId: roomUid,
          }
        ],
        logs: [
          ...prev.logs,
          {
            id: Date.now(),
            date: new Date().toLocaleString("pt-BR"),
            desc: "🎁 Starter Kit: Quarto + Rack Recebidos!",
            amount: 0,
            type: "in",
          }
        ]
      }))
      notify("Starter Kit Recebido! Comece sua operação.", "success")
    }
  }, []) // Run once on mount

  useEffect(() => {
    const healthDecayInterval = setInterval(() => {
      setState((prev) => {
        const now = Date.now()
        const updatedInventory = prev.inventory.map((item) => {
          // Apenas mineradoras instaladas em quartos com energia sofrem decaimento
          if (item.type === "miner" && item.parentId) {
            const shelf = prev.inventory.find((i) => i.uid === item.parentId)
            if (shelf && shelf.parentId) {
              const room = prev.inventory.find((r) => r.uid === shelf.parentId)
              if (room && room.power !== false) {
                // Mineradora está instalada e o quarto tem energia
                const currentHealth = item.health ?? 100
                const lastUpdate = item.lastHealthUpdate || now
                const timePassed = now - lastUpdate

                // Decai 3.33 pontos a cada 24h = 0.00003858 pontos por segundo
                const decayRate = 3.33 / (24 * 60 * 60) // pontos por segundo
                const decayAmount = (timePassed / 1000) * decayRate

                const newHealth = Math.max(0, currentHealth - decayAmount)

                if (currentHealth > 0 && newHealth <= 0) {
                  const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
                  const dbMiner = ITEMS_DB.miner.find((x) => x.id === item.id)
                  setTimeout(() => {
                    notify(
                      `⚠️ Alerta: ${dbMiner?.name || "Uma mineradora"} parou de funcionar no ${dbRoom?.name || "quarto"}!`,
                      "error",
                    )
                  }, 100)
                }

                return {
                  ...item,
                  health: newHealth,
                  lastHealthUpdate: now,
                }
              }
            }
          }

          // Inicializa health se não existir (para itens antigos)
          if (item.type === "miner" && item.health === undefined) {
            return {
              ...item,
              health: 100,
              lastHealthUpdate: now,
            }
          }

          return item
        })

        return { ...prev, inventory: updatedInventory }
      })
    }, 5000) // Atualiza a cada 5 segundos

    return () => clearInterval(healthDecayInterval)
  }, [])

  // Rent Check Loop (Lower Frequency)
  useEffect(() => {
    const rentInterval = setInterval(() => {
      setState((prev) => {
        const now = Date.now()
        let updatedInv = [...prev.inventory]
        let updatedWallet = prev.wallet
        const logsToAdd: any[] = []
        let changed = false

        updatedInv = updatedInv.map((item) => {
          if (item.type !== "room") return item

          if (!item.lastRentPaid) {
            return { ...item, lastRentPaid: now, power: true }
          }

          const timeLeft = item.lastRentPaid + RENT_DURATION_MS - now

          if (timeLeft <= 0) {
            const dbRoom = ITEMS_DB.room.find((r) => r.id === item.id)
            if (!dbRoom || !dbRoom.rent) return item

            const allowedAuto = ["rare", "epic", "legendary"].includes(dbRoom.tier)

            if (allowedAuto && item.autoPay && updatedWallet >= dbRoom.rent) {
              updatedWallet -= dbRoom.rent
              logsToAdd.push({
                id: Date.now() + Math.random(),
                date: new Date().toLocaleString("pt-BR"),
                desc: `Auto-Aluguel: ${dbRoom.name}`,
                amount: -dbRoom.rent,
                type: "out",
              })
              changed = true
              return { ...item, lastRentPaid: now, power: true }
            } else {
              if (item.power !== false) {
                changed = true
                return { ...item, power: false, autoPay: allowedAuto && item.autoPay ? false : item.autoPay }
              }
            }
          }
          return item
        })

        if (changed) {
          return { ...prev, wallet: updatedWallet, inventory: updatedInv, logs: [...prev.logs, ...logsToAdd] }
        }
        return prev
      })
    }, 1000)
    return () => clearInterval(rentInterval)
  }, [])

  // --- MINING LOOP (Dedicated for Pool Accumulation) ---
  useEffect(() => {
    // Loop rápido (a cada 1s) para atualização visual e lógica
    const miningInterval = setInterval(() => {
      setState((prevState) => {
        // 1. Recalcula a produção TOTAL válida neste exato momento
        const currentDailyProduction = getActiveDailyProduction(prevState.inventory)

        // 2. Se produção for 0 (tudo desligado/quebrado), não faz nada
        if (currentDailyProduction <= 0) return prevState

        // 3. Calcula o ganho por segundo (Dia tem 86400s)
        const productionPerSecond = currentDailyProduction / 86400

        // 4. Adiciona ao saldo da Pool (NÃO à carteira principal)
        return {
          ...prevState,
          miningPool: prevState.miningPool + productionPerSecond,
        }
      })
    }, 1000) // Roda a cada 1 segundo

    return () => clearInterval(miningInterval)
  }, [])

  // Auto Save
  useEffect(() => {
    const saveInterval = setInterval(() => {
      localStorage.setItem("0xminer_v1", JSON.stringify(state))
    }, 10000)
    return () => clearInterval(saveInterval)
  }, [state])

  // Terminal Effect
  useEffect(() => {
    const termInterval = setInterval(() => {
      const daily = getActiveDailyProduction(state.inventory)
      let msg = ""
      if (daily > 0) {
        const events = [
          `<span class="text-neon-blue">[NET]</span> Novo bloco encontrado na rede DPIX`,
          `<span class="text-dpix-color">[GPU]</span> Share aceito (Dif: ${(daily * 10).toFixed(0)}k) - ${Math.floor(Math.random() * 40) + 10}ms`,
          `<span class="text-neon-green">[SYS]</span> Eficiência térmica: 98%`,
          `<span class="text-neon-yellow">[WRK]</span> Processando hash: 0x${Math.random().toString(16).substr(2, 8)}...`,
        ]
        msg = events[Math.floor(Math.random() * events.length)]
      } else {
        const hasInventory = state.inventory.some((i) => i.type === "miner" && i.parentId === null)
        if (hasInventory) {
          msg = `<span class="text-neon-yellow">[TIP]</span> Hardware detectado no inventário. Instale em um Quarto para iniciar.`
        } else {
          const idleEvents = [
            `<span class="text-neon-red">[ERR]</span> Nenhuma mineradora ativa. Sistema em repouso.`,
            `<span class="text-neon-blue">[SYS]</span> Aguardando configuração de infraestrutura...`,
            `<span class="text-neon-blue">[NET]</span> Desconectado da Pool.`,
          ]
          msg = idleEvents[Math.floor(Math.random() * idleEvents.length)]
        }
      }
      setTerminalLogs((prev) => [...prev.slice(-7), msg])
    }, 2500)
    return () => clearInterval(termInterval)
  }, [state.inventory]) // Add dependency to avoid stale closure if inventory changes rarely

  // --- ACTIONS ---
  // handleCollect is unchanged, but its position changed due to processBoxOpening moving
  const handleCollect = useCallback(() => {
    if (state.miningPool >= 10) {
      setState((prev) => ({
        ...prev,
        dpix: prev.dpix + state.miningPool,
        miningPool: 0,
      }))
      addLog("Saque Pool", state.miningPool.toFixed(2) + " DPIX", "coin")
      notify("DPIX coletado!", "success")
    }
  }, [state.miningPool, addLog, notify, setState])

  // processBoxOpening moved before handleBuy
  const processBoxOpening = useCallback(
    (boxItem: DBItem, boxType: string) => {
      const roll = Math.random() * 100
      let tier: Tier = "basic"
      if (roll > 99) tier = "legendary"
      else if (roll > 95) tier = "epic"
      else if (roll > 85) tier = "rare"
      else if (roll > 60) tier = "common"

      const possibleItems = ITEMS_DB[boxType as keyof typeof ITEMS_DB].filter(
        (i) => i.tier === tier && i.type !== "box" && !i.isSpecial,
      )
      const wonItem = possibleItems[Math.floor(Math.random() * possibleItems.length)]

      if (wonItem) {
        const newItem: InventoryItem = {
          uid: "uid_" + Date.now() + Math.random().toString(36).substr(2, 9),
          id: wonItem.id,
          type: boxType as any,
          parentId: null,
          boughtAt: Date.now(),
          lastRentPaid: boxType === "room" ? Date.now() : undefined,
          power: boxType === "room" ? true : undefined,
          autoPay: boxType === "room" ? false : undefined,
          health: boxType === "miner" ? 100 : undefined,
        }
        setState((prev) => ({ ...prev, inventory: [...prev.inventory, newItem] }))
        setBoxAnim({ wonItem, tier })
      } else {
        notify("Erro ao abrir box.", "error")
      }
    },
    [notify, setState],
  )

  // UPDATED: Handle Buy (Opens Modal)
  const handleBuy = useCallback(
    (item: DBItem, type: string) => {
      setBuyConfirmModal({ show: true, item, type })
    },
    [],
  )

  // NEW: Confirm Purchase Logic
  const confirmPurchase = useCallback(() => {
    if (!buyConfirmModal || !buyConfirmModal.item) return

    const { item, type } = buyConfirmModal
    const cost = item.price

    if (state.dpix < cost) {
      notify(`Saldo insuficiente. Você precisa de Ð ${cost.toFixed(2)}`, "error")
      setBuyConfirmModal(null)
      return
    }

    setState((prev) => ({ ...prev, dpix: prev.dpix - cost }))

    const newItem: InventoryItem = {
      uid: "uid_" + Date.now() + Math.random().toString(36).substr(2, 9),
      id: item.id,
      type: type as any,
      parentId: null,
      boughtAt: Date.now(),
      lastRentPaid: type === "room" ? Date.now() : undefined,
      power: type === "room" ? true : undefined,
      autoPay: type === "room" ? false : undefined,
      health: type === "miner" ? 100 : undefined,
    }

    setState((prev) => ({ ...prev, inventory: [...prev.inventory, newItem] }))
    addLog(`Comprou ${item.name}`, -cost, "coin")
    notify(`${item.name} comprado com sucesso!`, "success")
    setBuyConfirmModal(null)
  }, [buyConfirmModal, state.dpix, notify, addLog])


  const handleInstall = useCallback(
    (itemUid: string) => {
      if (!installModal) return

      // Verificar se é mineradora quebrada
      const item = state.inventory.find((i) => i.uid === itemUid)
      if (item?.type === "miner") {
        const health = item.health ?? 100
        if (health <= 0) {
          notify("Esta mineradora está superaquecida e precisa de manutenção antes de ser instalada!", "error")
          addLog(`[CRITICAL] Falha na instalação: Mineradora ${item.id} superaquecida.`, 0, "out")
          return
        }
      }

      // --- LOGIC HARDENING: SLOT LIMITS ---
      const parentUid = installModal.parentUid
      const parentItem = state.inventory.find((i) => i.uid === parentUid)

      if (parentItem) {
        const parentDB = ITEMS_DB[parentItem.type]?.find(x => x.id === parentItem.id)
        const maxSlots = parentDB?.slots || 1

        const currentChildren = state.inventory.filter(i => i.parentId === parentUid).length

        if (currentChildren >= maxSlots) {
          notify(`Capacidade esgotada! Este item suporta apenas ${maxSlots} slots.`, "error")
          addLog(`[WARN] Instalação falhou: Capacidade do ${parentDB?.name || 'item'} excedida.`, 0, "out")
          return
        }
      }
      // ------------------------------------

      setState((prev) => ({
        ...prev,
        inventory: prev.inventory.map((i) => (i.uid === itemUid ? { ...i, parentId: installModal.parentUid } : i)),
      }))
      notify("Item instalado!", "success")
      addLog(`[SUCCESS] Instalação concluída: ${item?.id} -> ${parentItem?.id}`, 0, "in")
      setInstallModal(null)
    },
    [installModal, notify, setState, state.inventory, addLog],
  )

  const handleUninstall = useCallback(
    (itemUid: string) => {
      setState((prev) => {
        const item = prev.inventory.find((i) => i.uid === itemUid)
        if (!item) return prev
        if (item.type === "shelf") {
          const children = prev.inventory.filter((i) => i.parentId === itemUid)
          if (children.length > 0) {
            notify("Esvazie a prateleira antes!", "error")
            return prev
          }
        }
        return {
          ...prev,
          inventory: prev.inventory.map((i) => (i.uid === itemUid ? { ...i, parentId: null } : i)),
        }
      })
    },
    [notify, setState],
  )

  const handlePayRent = useCallback(
    (roomUid: string) => {
      setPayModal({ roomUid })
    },
    [setPayModal],
  )

  const processPayRent = useCallback(() => {
    if (!payModal) return
    const room = state.inventory.find((r) => r.uid === payModal.roomUid)
    if (!room) return
    const dbRoom = ITEMS_DB.room.find((r) => r.id === room.id)
    if (dbRoom && dbRoom.rent) {
      if (state.dpix >= dbRoom.rent) {
        setState((prev) => ({
          ...prev,
          dpix: prev.dpix - (dbRoom.rent || 0),
          inventory: prev.inventory.map((i) =>
            i.uid === payModal.roomUid ? { ...i, lastRentPaid: Date.now(), power: true } : i,
          ),
        }))
        addLog(`Aluguel: ${dbRoom.name}`, -dbRoom.rent, "out")
        notify("Conta paga!", "success")
      } else {
        notify("Saldo insuficiente em DPIX", "error")
      }
    }
    setPayModal(null)
  }, [state.inventory, state.dpix, payModal, addLog, notify, setState])

  const toggleAutoPay = useCallback(
    (roomUid: string) => {
      setState((prev) => {
        const room = prev.inventory.find((r) => r.uid === roomUid)
        if (!room) return prev
        notify(`Pagamento Automático ${!room.autoPay ? "ATIVADO" : "DESATIVADO"}`, !room.autoPay ? "success" : "info")
        return {
          ...prev,
          inventory: prev.inventory.map((i) => (i.uid === roomUid ? { ...i, autoPay: !i.autoPay } : i)),
        }
      })
    },
    [notify, setState],
  )

  const openInstallModal = useCallback((type: string, uid: string) => {
    setInstallModal({ typeNeeded: type, parentUid: uid })
  }, [])

  const handleBankAction = useCallback(
    (amount: number) => {
      if (!bankModal) return
      if (bankModal.type === "deposit") {
        // Credit DPIX directly (1:1 ratio for simplicity in this game logic)
        setState((prev) => ({ ...prev, dpix: prev.dpix + amount }))
        addLog("Depósito (BRL -> DPIX)", amount, "coin")
        notify(`Depósito de ${formatBRL(amount)} convertido para ${amount} DPIX!`, "success")
      } else {
        const feeInfo = getWithdrawFee(state.createdAt)
        // Withdraw Logic: Deduct Gross from BRL Wallet
        if (amount > state.wallet) {
          notify("Saldo insuficiente", "error")
          return
        }
        setState((prev) => ({ ...prev, wallet: prev.wallet - amount }))
        addLog("Saque Bancário", -amount, "out")
        notify(`Saque processado!`, "success")
      }
      setBankModal(null)
    },
    [bankModal, state.createdAt, state.wallet, addLog, notify, setState],
  )

  // --- RECYCLE LOGIC ---
  const handleRecycleRequest = useCallback((uids: string[]) => {
    let totalValue = 0;
    const itemsToRecycle = uids.map(uid => state.inventory.find(i => i.uid === uid)).filter(Boolean);

    itemsToRecycle.forEach(item => {
      if (!item) return;
      if (item.type === 'miner') totalValue += 20;
      else if (item.type === 'room') totalValue += 8;
      else if (item.type === 'shelf') totalValue += 4;
      else totalValue += 1; // Fallback
    });

    setRecycleModal({ show: true, items: uids, totalValue });
  }, [state.inventory]);

  const confirmRecycle = useCallback(() => {
    if (!recycleModal) return;

    setState(prev => ({
      ...prev,
      dpix: prev.dpix + recycleModal.totalValue,
      inventory: prev.inventory.filter(i => !recycleModal.items.includes(i.uid)),
      logs: [
        {
          id: Date.now(),
          date: new Date().toLocaleString("pt-BR"),
          desc: `Reciclagem (${recycleModal.items.length} itens)`,
          amount: recycleModal.totalValue,
          type: "coin"
        },
        ...prev.logs
      ]
    }));
    notify(`Reciclado! +Ð ${recycleModal.totalValue}`, "success");
    setRecycleModal(null);
  }, [recycleModal, notify, setState]);

  // --- REPAIR LOGIC ---
  const handleRepairRequest = useCallback((uids: string[]) => {
    const itemsToRepair = uids.map(uid => state.inventory.find(i => i.uid === uid)).filter(Boolean);
    const validMiners = itemsToRepair.filter(i => i && i.type === 'miner');

    if (validMiners.length === 0) {
      notify("Nenhuma mineradora válida para reparar.", "error");
      return;
    }

    const totalCost = validMiners.length * 50;
    setRepairModal({ show: true, items: validMiners.map(i => i!.uid), totalCost });
  }, [state.inventory, notify]);

  const confirmRepair = useCallback(() => {
    if (!repairModal) return;

    if (state.dpix < repairModal.totalCost) {
      notify(`Saldo insuficiente. Necessário: Ð ${repairModal.totalCost}`, "error");
      setRepairModal(null);
      return;
    }

    setState(prev => ({
      ...prev,
      dpix: prev.dpix - repairModal.totalCost,
      inventory: prev.inventory.map(item =>
        repairModal.items.includes(item.uid)
          ? { ...item, health: 100, lastHealthUpdate: Date.now() }
          : item
      ),
      logs: [
        {
          id: Date.now(),
          date: new Date().toLocaleString("pt-BR"),
          desc: `Reparo (${repairModal.items.length} mineradoras)`,
          amount: -repairModal.totalCost,
          type: "coin"
        },
        ...prev.logs
      ]
    }));
    notify("Reparo concluído!", "success");
    setRepairModal(null);
  }, [repairModal, state.dpix, notify, setState]);



  const getMinersThatNeedRepair = useCallback(() => {
    return state.inventory.filter((item) => {
      if (item.type !== "miner" || !item.parentId) return false
      const health = item.health ?? 100
      return health <= 20 // Alerta quando health < 20%
    }).length
  }, [state.inventory])

  const payAllEnergy = useCallback(
    (rarity: Tier) => {
      const rentCosts: Record<Tier, number> = {
        basic: 0.6,
        common: 1.5,
        rare: 3.5,
        epic: 8.0,
        legendary: 20.0,
      }

      const cost = rentCosts[rarity]

      // Filtrar quartos que precisam de energia nessa raridade
      const roomsNeedingEnergy = state.inventory.filter((room) => {
        if (room.type !== "room") return false
        const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
        if (!dbRoom || dbRoom.tier !== rarity) return false

        const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
        return timeLeft <= 0 || timeLeft < RENT_DURATION_MS
      })

      if (roomsNeedingEnergy.length === 0) {
        notify("Todos os quartos já têm energia suficiente!", "info")
        return
      }

      const totalCost = cost * roomsNeedingEnergy.length

      // Abrir modal de confirmação
      setPayAllModal({ rarity, count: roomsNeedingEnergy.length, total: totalCost })
    },
    [state.inventory, notify],
  )

  const processPayAllEnergy = useCallback(() => {
    if (!payAllModal) return

    const { rarity, count, total } = payAllModal

    if (state.dpix < total) {
      notify(`Saldo insuficiente! Necessário: Ð ${total.toFixed(2)}`, "error")
      setPayAllModal(null)
      return
    }

    const rentCosts: Record<Tier, number> = {
      basic: 0.6,
      common: 1.5,
      rare: 3.5,
      epic: 8.0,
      legendary: 20.0,
    }

    const cost = rentCosts[rarity]

    const roomsNeedingEnergy = state.inventory.filter((room) => {
      if (room.type !== "room") return false
      const dbRoom = ITEMS_DB.room.find((x) => x.id === room.id)
      if (!dbRoom || dbRoom.tier !== rarity) return false

      const timeLeft = (room.lastRentPaid || 0) + RENT_DURATION_MS - Date.now()
      return timeLeft <= 0 || timeLeft < RENT_DURATION_MS
    })

    // Pagar todos
    setState((prev) => ({
      ...prev,
      dpix: prev.dpix - total,
      inventory: prev.inventory.map((i) => {
        if (roomsNeedingEnergy.find((r) => r.uid === i.uid)) {
          return { ...i, lastRentPaid: Date.now(), power: true }
        }
        return i
      }),
    }))

    addLog(`Energia: ${count} quartos`, -total, "out")
    notify(
      `⚡ Energia renovada para ${count} ${count === 1 ? "quarto" : "quartos"}! Custo: Ð ${total.toFixed(2)}`,
      "success",
    )
    setPayAllModal(null)
  }, [payAllModal, state.dpix, state.inventory, setState, addLog, notify])

  const EXCHANGE_RATE = 100 // 1 BRL = 100 DPIX (ou 100 DPIX = 1 BRL)
  const CURRENT_EXCHANGE_FEE = 0.02 // Taxa de 2%

  const exchangeDpixToBrl = (dpixAmount: number) => {
    if (dpixAmount <= 0 || dpixAmount > state.dpix) {
      notify("Valor inválido ou saldo insuficiente de DPIX", "error")
      return
    }

    const brlValue = dpixAmount / EXCHANGE_RATE
    const fee = brlValue * CURRENT_EXCHANGE_FEE
    const brlAfterFee = brlValue - fee

    setState((prev) => ({
      ...prev,
      dpix: prev.dpix - dpixAmount,
      wallet: prev.wallet + brlAfterFee,
    }))

    notify(
      `Convertido Ð ${dpixAmount.toFixed(2)} → R$ ${brlAfterFee.toFixed(2)} (taxa: R$ ${fee.toFixed(2)})`,
      "success",
    )
    setExchangeModal({ open: false, mode: null })
    setExchangeAmount("")
  }

  const exchangeBrlToDpix = (brlAmount: number) => {
    if (brlAmount <= 0 || brlAmount > state.wallet) {
      notify("Valor inválido ou saldo insuficiente de BRL", "error")
      return
    }

    const fee = brlAmount * CURRENT_EXCHANGE_FEE
    const brlAfterFee = brlAmount - fee
    const dpixValue = brlAfterFee * EXCHANGE_RATE

    setState((prev) => ({
      ...prev,
      wallet: prev.wallet - brlAmount,
      dpix: prev.dpix + dpixValue,
    }))

    notify(`Convertido R$ ${brlAmount.toFixed(2)} → Ð ${dpixValue.toFixed(2)} (taxa: R$ ${fee.toFixed(2)})`, "success")
    setExchangeModal({ open: false, mode: null })
    setExchangeAmount("")
  }

  const handleExchangeSubmit = () => {
    const amount = Number.parseFloat(exchangeAmount)
    if (isNaN(amount)) {
      notify("Digite um valor válido", "error")
      return
    }

    if (exchangeModal.mode === "dpix-to-brl") {
      exchangeDpixToBrl(amount)
    } else if (exchangeModal.mode === "brl-to-dpix") {
      exchangeBrlToDpix(amount)
    }
  }

  // --- SMART ROUTING (ONBOARDING) ---
  const handleQuickStart = () => {
    const boxCost = 100 // Cost of Basic Box
    const boxCostBRL = boxCost * DPIX_PRICE_BRL

    if (state.dpix >= boxCost) {
      // Has enough DPIX -> Go to Shop
      setActiveView("shop")
      setShopFilter("box")
      notify("Compre sua primeira Box de Mineração!", "success")
    } else if (state.wallet >= boxCostBRL) {
      // Has BRL but no DPIX -> Go to Exchange
      setExchangeModal({ open: true, mode: "brl-to-dpix" })
      setExchangeAmount(boxCostBRL.toString())
      notify("Converta BRL para DPIX para comprar equipamentos.", "info")
    } else {
      ```
      // No Funds -> Go to Bank
      setBankModal({ type: "deposit" })
      notify("Faça um depósito para iniciar sua operação.", "info")
    }
  }


  return (
    <div className="h-screen w-full flex overflow-hidden bg-bg-dark text-text-main">
      {/* MOBILE OVERLAY */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-50 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
       ></div>
      )}

      {/* SIDEBAR */}
      <div className={`fixed md:static inset - y - 0 left - 0 z - [60] w - [260px] min - w - [260px] bg - sidebar - bg border - r border - border - color flex flex - col p - 5 transition - transform duration - 300 ease -in -out shrink - 0 h - full ${ mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0" } `}>
        <div className="text-[20px] font-bold text-white mb-10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/logo-0xminer-v2.jpg" alt="0xMINER" className="w-8 h-8 object-contain drop-shadow-[0_0_5px_rgba(0,230,118,0.5)] rounded-full" /> 0xMINER
          </div>
          {/* Close button for mobile */}
          <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-[#888] hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <ul className="p-0 m-0 flex flex-col gap-2.5 list-none grow overflow-y-auto scrollbar-hide">
          {[
            { id: "dashboard", icon: "fa-chart-line", label: "Dashboard" },
            { id: "profile", icon: "fa-id-card", label: "Perfil" },
            { id: "rigs", icon: "fa-server", label: "Quartos (Infra)" },
            { id: "inventory", icon: "fa-boxes-stacked", label: "Inventário" },
            { id: "shop", icon: "fa-cart-shopping", label: "Mercado" },
            { id: "exchange", icon: "fa-money-bill-transfer", label: "Câmbio" },
            { id: "ranking", icon: "fa-trophy", label: "Ranking" },
            { id: "referrals", icon: "fa-users", label: "Indicações" },
          ].map((link) => (
            <li
              key={link.id}
              onClick={() => {
                setActiveView(link.id)
                setMobileMenuOpen(false) // Close menu on click
              }}
              className={`px - 4 py - 3 rounded - lg cursor - pointer transition - all flex items - center gap - 3 font - medium ${ activeView === link.id ? "bg-accent text-white shadow-[0_4px_15px_rgba(114,137,218,0.3)]" : "text-text-muted hover:bg-white/5 hover:text-white" } `}
            >
              <i className={`fa - solid ${ link.icon } `}></i> {link.label}
            </li>
          ))}
          {/* Logout Item */}
          <li
            onClick={handleLogout}
            className="px-4 py-3 rounded-lg cursor-pointer transition-all flex items-center gap-3 font-medium text-text-muted hover:bg-neon-red/10 hover:text-neon-red mt-auto"
         >
            <i className="fa-solid fa-power-off"></i> Sair
          </li>
        </ul>
        <div className="mt-4 text-[11px] text-[#555] text-center shrink-0">
          v9.3.0 Dash Merge
          <br />
          Server: São Paulo (BR)
        </div>
      </div>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* HEADER (Fixed Height, No Shrink) */}
        <div className="h-[70px] shrink-0 border-b border-border-color flex items-center justify-between px-4 md:px-[30px] bg-[#0b0505]/95 backdrop-blur-sm z-20">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg bg-[#1a1a2e] text-white border border-[#333]"
           >
              <i className="fa-solid fa-bars"></i>
            </button>

            <div className="text-sm text-[#888] hidden sm:block">
              Bem-vindo, <strong>{state.username}</strong> <span className="text-[#444] mx-2">|</span> <span className="text-xs bg-[#222] px-2 py-1 rounded text-[#aaa]"><i className="fa-solid fa-trophy text-yellow-600 mr-1"></i> #{userRank}</span>
            </div>
          </div>
          <div className="flex gap-4">
            <a
              href="https://whitepaper-doc.netlify.app"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#111] border border-border-color px-4 py-2 rounded-full font-bold font-mono flex items-center gap-2.5 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)] whitespace-nowrap hover:bg-[#1a1a2e] hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all cursor-pointer no-underline"
              title="Ler Whitepaper Oficial"
           >
              <i className="fa-solid fa-book-open"></i>
              <span className="hidden md:inline">Whitepaper</span>
            </a>
            <button
              onClick={() => setActiveView("exchange")}
              className="bg-[#111] border border-border-color px-4 py-2 rounded-full font-bold font-mono flex items-center gap-2.5 text-dpix-color shadow-[0_0_10px_rgba(217,70,239,0.1)] border-dpix-color/30 whitespace-nowrap hover:bg-[#1a1a2e] hover:shadow-[0_0_15px_rgba(217,70,239,0.2)] transition-all cursor-pointer"
              title="Clique para acessar Câmbio (DPIX ⇄ BRL)"
           >
              <i className="fa-solid fa-coins"></i>
              <span className="text-xs opacity-70">DPIX</span>
              <span>{formatDPIX(state.dpix)}</span>
            </button>
            <button
              onClick={() => setActiveView("profile")}
              className="bg-[#111] border border-border-color px-4 py-2 rounded-full font-bold font-mono flex items-center gap-2.5 text-neon-green shadow-[0_0_10px_rgba(0,230,118,0.1)] whitespace-nowrap hover:bg-[#1a1a2e] hover:shadow-[0_0_15px_rgba(0,230,118,0.2)] transition-all cursor-pointer"
              title="Clique para Depositar ou Sacar BRL"
           >
              <i className="fa-solid fa-wallet"></i>
              <span>{formatBRL(state.wallet)}</span>
            </button>
          </div>
        </div>

        {/* SCROLLABLE VIEW AREA */}
        <div className="flex-1 overflow-y-auto relative scroll-smooth">
          {/* VIEWS */}
          {activeView === "dashboard" && (
            <div className="p-8 animate-slide-in max-w-7xl mx-auto w-full pb-20">

              {/* DASHBOARD TABS */}
              <div className="flex gap-4 mb-8 border-b border-[#333] pb-1">
                <button
                  onClick={() => setDashTab("overview")}
                  className={`text - sm font - bold uppercase tracking - wider px - 6 py - 3 rounded - t - lg transition - all border - b - 2 ${ dashTab === "overview" ? "border-accent text-accent bg-accent/5" : "border-transparent text-[#888] hover:text-white hover:bg-white/5" } `}
               >
                  <i className="fa-solid fa-chart-line mr-2"></i> Visão Geral
                </button>
                <button
                  onClick={() => setDashTab("financial")}
                  className={`text - sm font - bold uppercase tracking - wider px - 6 py - 3 rounded - t - lg transition - all border - b - 2 ${ dashTab === "financial" ? "border-accent text-accent bg-accent/5" : "border-transparent text-[#888] hover:text-white hover:bg-white/5" } `}
               >
                  <i className="fa-solid fa-file-invoice-dollar mr-2"></i> Relatórios Financeiros
                </button>
              </div>

              {/* TAB: OVERVIEW (COMMAND CENTER) */}
              {dashTab === "overview" && (
                <div className="animate-fade-in">
                  {/* ONBOARDING CTA: SYSTEM IDLE */}
                  {getActiveDailyProduction(state.inventory) === 0 && (
                    <div className="bg-gradient-to-r from-red-900/40 to-black border border-red-500/50 rounded-xl p-6 mb-8 flex items-center justify-between relative overflow-hidden shadow-[0_0_20px_rgba(255,0,0,0.2)] animate-pulse-slow">
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10"></div>
                      <div className="relative z-10 flex items-center gap-6">
                        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/50">
                          <i className="fa-solid fa-triangle-exclamation text-3xl text-red-500 animate-pulse"></i>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            🚨 SISTEMA OCIOSO
                          </h3>
                          <p className="text-sm text-gray-300 max-w-xl">
                            Você possui infraestrutura (Quarto + Rack), mas sua produção está zerada. Adquira mineradoras para iniciar a operação.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleQuickStart}
                        className="relative z-10 bg-white text-red-900 px-8 py-3 rounded-lg font-bold uppercase hover:bg-gray-100 hover:scale-105 transition-all shadow-lg flex items-center gap-2 whitespace-nowrap"
                     >
                        <i className="fa-solid fa-rocket"></i> Iniciar Operação (Ð 100)
                      </button>
                    </div>
                  )}

                  {/* 1. TOP: REAL-TIME TICKER & SUMMARY */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 mb-8">
                    {/* Pool Ticker */}
                    <div className="bg-gradient-to-br from-[#1f202e] to-[#161722] border border-dpix-color rounded-xl p-8 flex flex-col justify-center relative overflow-hidden shadow-[0_0_30px_rgba(217,70,239,0.1)]">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-dpix-color blur-[100px] opacity-10 pointer-events-none"></div>
                      <div className="text-[#aaa] text-sm tracking-[0.2em] uppercase mb-2 font-bold flex items-center gap-2">
                        <i className="fa-solid fa-layer-group text-dpix-color"></i> Mining Pool
                      </div>
                      <div className="text-[48px] md:text-[64px] font-mono text-white font-bold tracking-tighter leading-none drop-shadow-[0_0_15px_rgba(217,70,239,0.5)]">
                        {state.miningPool.toFixed(6)} <span className="text-dpix-color text-3xl align-top">Ð</span>
                      </div>
                      <div className="flex items-center gap-4 mt-6">
                        <div className="text-xs text-[#888] bg-black/30 px-3 py-1.5 rounded border border-white/5">
                          <i className="fa-solid fa-bolt text-neon-yellow mr-1.5"></i>
                          {getActiveDailyProduction(state.inventory).toFixed(2)} Ð/dia
                        </div>
                        <button
                          onClick={handleCollect}
                          disabled={state.miningPool < 10}
                          className="bg-dpix-color text-white border-none px-6 py-1.5 rounded text-xs font-bold uppercase disabled:opacity-30 disabled:cursor-not-allowed hover:bg-dpix-color/80 transition-all ml-auto"
                       >
                          {state.miningPool>= 10 ? "Transferir Saldo" : `Min: 10.00 Ð`}
                        </button>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-rows-2 gap-4">
                      <div className="bg-card-bg border border-border-color rounded-xl p-4 flex items-center justify-between relative overflow-hidden group">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent"></div>
                        <div>
                          <div className="text-[10px] text-[#888] uppercase tracking-wider mb-1">Poder Total</div>
                          <div className="text-2xl font-bold text-white font-mono">{getActivePower(state.inventory)} <span className="text-sm text-[#666]">MH/s</span></div>
                        </div>
                        <i className="fa-solid fa-microchip text-3xl text-accent/20 group-hover:text-accent/40 transition-colors"></i>
                      </div>
                      <div className="bg-card-bg border border-border-color rounded-xl p-4 flex items-center justify-between relative overflow-hidden group">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-red"></div>
                        <div>
                          <div className="text-[10px] text-[#888] uppercase tracking-wider mb-1">Consumo (W)</div>
                          <div className="text-2xl font-bold text-white font-mono">{getActiveWatts(state.inventory)} <span className="text-sm text-[#666]">W</span></div>
                        </div>
                        <i className="fa-solid fa-plug text-3xl text-neon-red/20 group-hover:text-neon-red/40 transition-colors"></i>
                      </div>
                    </div>
                  </div>

                  {/* 2. MIDDLE: VISUAL ANALYTICS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

                    {/* Profit/Loss Graph (CSS Pure) */}
                    <div className="bg-[#111] border border-[#333] rounded-xl p-6 relative">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-6">
                        <i className="fa-solid fa-chart-line text-neon-green"></i> Lucratividade Diária
                      </h3>

                      {(() => {
                        const dailyProd = getActiveDailyProduction(state.inventory) * DPIX_PRICE_BRL
                        const dailyCost = getTotalRentCost(state.inventory) * 2 // 2 cycles of 12h
                        const maxVal = Math.max(dailyProd, dailyCost, 10) // Scale base
                        const prodPct = (dailyProd / maxVal) * 100
                        const costPct = (dailyCost / maxVal) * 100
                        const profit = dailyProd - dailyCost

                        return (
                          <div className="space-y-6">
                            {/* Production Bar */}
                            <div>
                              <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-[#aaa]">Receita Bruta</span>
                                <span className="text-neon-green font-mono">{formatBRL(dailyProd)}</span>
                              </div>
                              <div className="h-3 bg-[#222] rounded-full overflow-hidden">
                                <div className="h-full bg-neon-green transition-all duration-1000" style={{ width: `${ prodPct }% ` }}></div>
                              </div>
                            </div>

                            {/* Cost Bar */}
                            <div>
                              <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-[#aaa]">Custo Operacional</span>
                                <span className="text-neon-red font-mono">{formatBRL(dailyCost)}</span>
                              </div>
                              <div className="h-3 bg-[#222] rounded-full overflow-hidden">
                                <div className="h-full bg-neon-red transition-all duration-1000" style={{ width: `${ costPct }% ` }}></div>
                              </div>
                            </div>

                            {/* Net Profit Indicator */}
                            <div className="pt-4 border-t border-[#333] flex justify-between items-center">
                              <span className="text-xs text-[#888] uppercase font-bold">Lucro Líquido Estimado</span>
                              <span className={`text - xl font - mono font - bold ${ profit >= 0 ? 'text-neon-green' : 'text-neon-red' } `}>
                                {profit> 0 ? '+' : ''}{formatBRL(profit)}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Health Speedometer */}
                    <div className="bg-[#111] border border-[#333] rounded-xl p-6 flex flex-col items-center justify-center relative">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4 absolute top-6 left-6">
                        <i className="fa-solid fa-heart-pulse text-neon-orange"></i> Saúde da Farm
                      </h3>

                      {(() => {
                        const miners = state.inventory.filter(i => i.type === 'miner')
                        const totalHealth = miners.reduce((acc, m) => acc + (m.health || 0), 0)
                        const avgHealth = miners.length> 0 ? totalHealth / miners.length : 100

                        // Gauge Color Logic
                        const color = avgHealth> 90 ? '#00e676' : avgHealth> 50 ? '#ffea00' : '#ff5252'

                        return (
                          <div className="relative w-[200px] h-[100px] mt-8 overflow-hidden">
                            {/* Gauge Background */}
                            <div className="absolute bottom-0 left-0 w-full h-full rounded-t-full border-[20px] border-[#222] border-b-0"></div>
                            {/* Gauge Value */}
                            <div
                              className="absolute bottom-0 left-0 w-full h-full rounded-t-full border-[20px] border-b-0 transition-all duration-1000 origin-bottom"
                              style={{
                                borderColor: color,
                                transform: `rotate(${(avgHealth / 100) * 180 - 180}deg)`
                              }}
                           ></div>
                            {/* Text Value */}
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-3xl font-bold text-white font-mono">
                              {avgHealth.toFixed(0)}%
                            </div>
                          </div>
                        )
                      })()}
                      <div className="text-xs text-[#666] mt-4 text-center max-w-[200px]">
                        Mantenha a saúde acima de 90% para eficiência máxima.
                      </div>
                    </div>
                  </div>

                  {/* 3. BOTTOM: INTELLIGENT TERMINAL */}
                  <div className="bg-black border border-[#333] rounded-lg font-mono p-0 overflow-hidden shadow-2xl relative group">
                    {/* Terminal Header */}
                    <div className="bg-[#1a1a1a] px-4 py-2 border-b border-[#333] flex justify-between items-center">
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                      </div>
                      <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">System Terminal // v2.0.4</div>
                    </div>

                    {/* Terminal Body */}
                    <div className="p-4 h-[250px] overflow-y-auto font-mono text-xs relative">
                      {/* Scanline Effect */}
                      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 pointer-events-none bg-[length:100%_4px,3px_100%]"></div>

                      <div className="flex flex-col justify-end min-h-full gap-1 relative z-0">
                        {terminalLogs.map((log, i) => (
                          <div
                            key={i}
                            className="animate-slide-in break-words"
                            dangerouslySetInnerHTML={{ __html: log }}
                         ></div>
                        ))}
                        <div className="animate-pulse text-neon-green">_</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: FINANCIAL REPORTS */}
              {dashTab === "financial" && (
                <div className="animate-fade-in">
                  <FinancialTable inventory={state.inventory} />
                </div>
              )}

            </div>
          )}

          {activeView === "profile" && (
            <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">
              {/* Header Section */}
              <div className="relative mb-10">
                <div className="h-[180px] w-full bg-gradient-to-r from-[#1f202e] to-[#151621] rounded-2xl border border-[#333] overflow-hidden relative">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c15] to-transparent opacity-80"></div>
                </div>
                <div className="absolute -bottom-10 left-10 flex items-end gap-6 max-md:flex-col max-md:items-center max-md:left-0 max-md:w-full">
                  <div className="w-[140px] h-[140px] rounded-full bg-[#0b0c15] border-4 border-accent p-1 relative group">
                    <div className="w-full h-full rounded-full bg-[#1a1c29] flex items-center justify-center overflow-hidden relative">
                      <i className="fa-solid fa-user-astronaut text-[60px] text-white/80"></i>
                    </div>
                    <div className="absolute bottom-2 right-2 w-8 h-8 bg-accent rounded-full border-4 border-[#0b0c15] flex items-center justify-center text-white text-xs font-bold" title="Nível">
                      {Math.floor(getAccountAgeDays(state.createdAt) / 7) + 1}
                    </div>
                  </div>
                  <div className="mb-4 max-md:text-center">
                    <div className="flex items-center gap-3 mb-1 max-md:justify-center">
                      <h2 className="text-3xl font-bold text-white">{state.username}</h2>
                      <button
                        onClick={() => {
                          const n = prompt("Novo nome:")
                          if (n && n.length> 2) {
                            setState((p) => ({ ...p, username: n.substring(0, 12) }))
                            notify("Nome alterado!", "success")
                          }
                        }}
                        className="w-8 h-8 rounded-full bg-[#222] hover:bg-[#333] flex items-center justify-center text-[#888] hover:text-white transition-all border border-[#333]"
                     >
                        <i className="fa-solid fa-pen text-xs"></i>
                      </button>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[#888] max-md:justify-center max-md:flex-wrap">
                      <span className="flex items-center gap-1.5 bg-[#1a1c29] px-3 py-1 rounded-full border border-[#333]">
                        <i className="fa-solid fa-fingerprint text-accent"></i> UID: {state.referral.code}
                      </span>
                      <span className="flex items-center gap-1.5 bg-[#1a1c29] px-3 py-1 rounded-full border border-[#333]">
                        <i className="fa-regular fa-calendar text-accent"></i> Membro há {getAccountAgeDays(state.createdAt)} dias
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Grid */}
              <div className="grid grid-cols-[1fr_350px] gap-6 mt-16 max-lg:grid-cols-1">

                {/* Left Column */}
                <div className="flex flex-col gap-6">

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
                    {(() => {
                      const inventoryValue = state.inventory.reduce((acc, item) => {
                        const dbItem = ITEMS_DB[item.type]?.find(x => x.id === item.id);
                        return acc + (dbItem?.price || 0);
                      }, 0);

                      const netWorth = state.wallet + (state.dpix * DPIX_PRICE_BRL) + (inventoryValue * DPIX_PRICE_BRL);

                      return (
                        <>
                          <div className="bg-card-bg border border-border-color rounded-xl p-5 relative overflow-hidden group hover:border-accent/50 transition-all">
                            <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                              <i className="fa-solid fa-sack-dollar text-6xl text-white"></i>
                            </div>
                            <div className="text-xs text-[#888] uppercase tracking-wider mb-2">Patrimônio Líquido</div>
                            <div className="text-xl font-bold text-white font-mono">{formatBRL(netWorth)}</div>
                            <div className="text-[10px] text-[#666] mt-1">Wallet + DPIX + Ativos</div>
                          </div>
                          <div className="bg-card-bg border border-border-color rounded-xl p-5 relative overflow-hidden group hover:border-dpix-color/50 transition-all">
                            <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                              <i className="fa-solid fa-boxes-stacked text-6xl text-dpix-color"></i>
                            </div>
                            <div className="text-xs text-[#888] uppercase tracking-wider mb-2">Valor em Ativos</div>
                            <div className="text-xl font-bold text-dpix-color font-mono">{formatDPIX(inventoryValue)}</div>
                            <div className="text-[10px] text-[#666] mt-1">{state.inventory.length} itens totais</div>
                          </div>
                          <div className="bg-card-bg border border-border-color rounded-xl p-5 relative overflow-hidden group hover:border-neon-green/50 transition-all">
                            <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                              <i className="fa-solid fa-trophy text-6xl text-neon-green"></i>
                            </div>
                            <div className="text-xs text-[#888] uppercase tracking-wider mb-2">Ranking Global</div>
                            <div className="text-xl font-bold text-neon-green font-mono">#{userRank}</div>
                            <div className="text-[10px] text-[#666] mt-1">Top 1 Jogadores</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Badges Section */}
                  <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                      <i className="fa-solid fa-medal text-yellow-500"></i> Conquistas & Insígnias
                    </h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
                      {(() => {
                        const badges = [
                          { id: 'early', icon: 'fa-rocket', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', label: 'Pioneiro', condition: true },
                          { id: 'rich', icon: 'fa-sack-dollar', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', label: 'Magnata', condition: state.wallet> 100000 },
                          { id: 'miner', icon: 'fa-server', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20', label: 'Minerador', condition: state.inventory.filter(i => i.type === 'miner').length> 10 },
                          {
                            id: 'collector', icon: 'fa-gem', color: 'text-pink-400', bg: 'bg-pink-400/10', border: 'border-pink-400/20', label: 'Colecionador', condition: state.inventory.some(i => {
                              const db = ITEMS_DB[i.type]?.find(x => x.id === i.id);
                              return db?.tier === 'legendary' || db?.tier === 'special';
                            })
                          },
                          { id: 'social', icon: 'fa-users', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', label: 'Influencer', condition: (state.referral.users.lvl1 + state.referral.users.lvl2)> 5 },
                        ];

                        return badges.map(badge => (
                          <div key={badge.id} className={`aspect - square rounded - xl border flex flex - col items - center justify - center gap - 2 transition - all ${ badge.condition ? `${badge.bg} ${badge.border}` : 'bg-[#111] border-[#222] opacity-30 grayscale' } `}>
                            <i className={`fa - solid ${ badge.icon } text - 2xl ${ badge.condition ? badge.color : 'text-[#555]' } `}></i>
                            <span className={`text - [10px] font - bold ${ badge.condition ? 'text-white' : 'text-[#555]' } `}>{badge.label}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Transaction History */}
                  <div className="bg-card-bg border border-border-color rounded-xl overflow-hidden flex flex-col grow">
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#151621]">
                      <h3 className="text-white font-bold flex items-center gap-2">
                        <i className="fa-solid fa-list-ul text-[#888]"></i> Últimas Transações
                      </h3>
                      <button className="text-xs text-accent hover:text-white transition-colors">Ver Todas</button>
                    </div>
                    <div className="overflow-y-auto max-h-[300px]">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-[#111] text-[10px] uppercase text-[#666] sticky top-0">
                          <tr>
                            <th className="p-3 font-medium">Data</th>
                            <th className="p-3 font-medium">Descrição</th>
                            <th className="p-3 font-medium text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {[...state.logs].reverse().slice(0, 15).map((log) => (
                            <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="p-3 text-[#888] text-xs font-mono">{log.date.split(' ')[0]}</td>
                              <td className="p-3 text-white">
                                <div className="flex items-center gap-2">
                                  <span className={`w - 1.5 h - 1.5 rounded - full ${ log.type === 'in' ? 'bg-neon-green' : log.type === 'out' ? 'bg-neon-red' : 'bg-dpix-color' } `}></span>
                                  {log.desc}
                                </div>
                              </td>
                              <td className={`p - 3 text - right font - mono font - bold ${ log.type === 'in' ? 'text-neon-green' : log.type === 'out' ? 'text-neon-red' : 'text-dpix-color' } `}>
                                {typeof log.amount === "number" && log.type !== "coin" ? formatBRL(log.amount) : typeof log.amount === "number" ? `${ log.amount.toFixed(2) } Ð` : log.amount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>

                {/* Right Column - Financial Actions */}
                <div className="flex flex-col gap-6">

                  {/* Wallet Card */}
                  <div className="bg-gradient-to-b from-[#1f202e] to-[#151621] border border-border-color rounded-xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-neon-green blur-[80px] opacity-10 pointer-events-none"></div>
                    <div className="text-xs text-[#888] uppercase mb-1 font-bold">Saldo Disponível (BRL)</div>
                    <div className="text-3xl font-bold text-white font-mono mb-6">{formatBRL(state.wallet)}</div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <button
                        onClick={() => setBankModal({ type: "deposit" })}
                        className="bg-neon-green text-black py-3 rounded-lg font-bold text-sm hover:bg-green-400 transition-all flex items-center justify-center gap-2"
                     >
                        <i className="fa-solid fa-arrow-down"></i> Depositar
                      </button>
                      <button
                        onClick={() => setBankModal({ type: "withdraw" })}
                        className="bg-[#222] text-white border border-[#333] py-3 rounded-lg font-bold text-sm hover:bg-[#333] transition-all flex items-center justify-center gap-2"
                     >
                        <i className="fa-solid fa-arrow-up"></i> Sacar
                      </button>
                    </div>

                    <div className="bg-black/30 rounded-lg p-3 text-xs text-[#888] border border-white/5">
                      <div className="flex justify-between mb-1">
                        <span>Status da Conta</span>
                        <span className="text-neon-green">Verificada</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Limite Diário</span>
                        <span className="text-white">R$ 50.000,00</span>
                      </div>
                    </div>
                  </div>

                  {/* Withdraw Fee Card */}
                  <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-white text-sm">Taxa de Fidelidade</h4>
                      <span className={`text - xs font - bold px - 2 py - 0.5 rounded ${ getWithdrawFee(state.createdAt).color } bg - white / 5`}>
                        {getWithdrawFee(state.createdAt).label}
                      </span>
                    </div>

                    <div className="relative h-2 bg-[#222] rounded-full mb-4 overflow-hidden">
                      {/* Progress Bar Logic */}
                      {(() => {
                        const days = getAccountAgeDays(state.createdAt);
                        const pct = Math.min(100, (days / 21) * 100);
                        return (
                          <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-neon-red via-neon-yellow to-neon-green transition-all duration-1000" style={{ width: `${ pct }% ` }}></div>
                        )
                      })()}
                    </div>

                    <div className="flex justify-between text-[10px] text-[#666] mb-4">
                      <span>30%</span>
                      <span>15%</span>
                      <span>5% (VIP)</span>
                    </div>

                    <div className="text-[11px] text-[#888] leading-relaxed">
                      Quanto mais tempo você mantém sua conta ativa, menor a taxa de saque. <span className="text-white">Atualmente você está no nível {getAccountAgeDays(state.createdAt)> 20 ? 'VIP' : getAccountAgeDays(state.createdAt)> 10 ? 'Intermediário' : 'Iniciante'}.</span>
                    </div>
                  </div>

                  {/* Security / Info */}
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5 flex gap-3">
                    <i className="fa-solid fa-shield-halved text-blue-400 text-xl"></i>
                    <div>
                      <h4 className="text-blue-400 font-bold text-sm mb-1">Segurança</h4>
                      <p className="text-[11px] text-blue-200/70 leading-relaxed">
                        Sua conta está protegida. Nunca compartilhe sua senha ou UID com terceiros. O suporte oficial nunca pedirá sua senha.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {activeView === "inventory" && (
            <InventoryView
              inventory={state.inventory}
              onUninstall={handleUninstall}
              onRequestRecycle={handleRecycleRequest}
              onRequestRepair={handleRepairRequest}
              setActiveView={setActiveView}
              notify={notify}
            />
          )}

          {activeView === "shop" && (
            <MarketView filter={shopFilter} setFilter={setShopFilter} onBuy={handleBuy} onOpenBox={processBoxOpening} />
          )}
          {activeView === "rigs" && (
            <InfraView
              inventory={state.inventory}
              onPayRent={handlePayRent}
              onInstall={openInstallModal}
              onUninstall={handleUninstall}
              onToggleAutoPay={toggleAutoPay}
              setActiveView={setActiveView}
              setShopFilter={setShopFilter}
              onRepairMiner={(uid) => handleRepairRequest([uid])} // Passando a função repairMiner como prop
              onPayAllEnergy={payAllEnergy} // Passando a função para o InfraView
              onDemolishRoom={demolishRoom} // Passando a função demolishRoom
            />
          )}
          {activeView === "ranking" && (
            <RankingView leaderboard={leaderboard} userRank={userRank} userNetWorth={userNetWorth} />
          )}
          {activeView === "exchange" && (
            <div className="p-6 animate-slide-in max-w-[1400px] mx-auto w-full pb-20">
              {/* Market Header */}
              <div className="flex flex-wrap items-center justify-between gap-6 mb-6 bg-[#151621] border border-[#333] p-4 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-dpix-color/10 flex items-center justify-center border border-dpix-color/20">
                    <i className="fa-solid fa-coins text-2xl text-dpix-color"></i>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      DPIX / BRL <span className="text-xs bg-[#222] text-[#888] px-2 py-0.5 rounded">SPOT</span>
                    </h2>
                    <div className="text-xs text-[#888]">DPIX Token Market</div>
                  </div>
                </div>

                <div className="flex gap-8 max-md:gap-4 max-md:flex-wrap">
                  <div>
                    <div className="text-[10px] text-[#666] uppercase font-bold mb-0.5">Preço Atual</div>
                    <div className="text-lg font-mono font-bold text-neon-green">R$ 1.00</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#666] uppercase font-bold mb-0.5">Variação 24h</div>
                    <div className="text-lg font-mono font-bold text-neon-green flex items-center gap-1">
                      <i className="fa-solid fa-caret-up"></i> +0.00%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#666] uppercase font-bold mb-0.5">Máxima 24h</div>
                    <div className="text-lg font-mono font-bold text-white">R$ 1.00</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#666] uppercase font-bold mb-0.5">Volume 24h</div>
                    <div className="text-lg font-mono font-bold text-white">Ð 1.2M</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_350px] gap-6 max-lg:grid-cols-1">

                {/* Left Column: Chart & Market Depth */}
                <div className="flex flex-col gap-6">

                  {/* Chart Area */}
                  <div className="bg-[#151621] border border-[#333] rounded-xl p-5 h-[400px] flex flex-col relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4 border-b border-[#333] pb-2">
                      <div className="flex gap-4">
                        <button className="text-xs font-bold text-white border-b-2 border-accent pb-2 -mb-2.5">Price Chart</button>
                        <button className="text-xs font-bold text-[#666] hover:text-white transition-colors">Depth</button>
                      </div>
                      <div className="flex gap-2">
                        {['1H', '4H', '1D', '1W'].map(t => (
                          <button key={t} className={`text - [10px] px - 2 py - 1 rounded ${ t === '1D' ? 'bg-[#333] text-white' : 'text-[#666] hover:bg-[#222]' } `}>{t}</button>
                        ))}
                      </div>
                    </div>

                    {/* Simulated Chart Visual */}
                    <div className="grow relative flex items-end gap-1 px-2 pb-6">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
                        {[1.05, 1.04, 1.03, 1.02, 1.01, 1.00].map(p => (
                          <div key={p} className="w-full border-t border-[#222] relative">
                            <span className="absolute -top-2 right-0 text-[9px] text-[#444] bg-[#151621] pl-1">R$ {p.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Candles (Simulated) */}
                      {(() => {
                        return [...Array(40)].map((_, i) => {
                          const height = 20 + Math.random() * 60;
                          const isGreen = Math.random()> 0.45; // Slightly bullish
                          return (
                            <div key={i} className="flex-1 flex flex-col justify-center items-center group relative">
                              <div className={`w - [1px] h - [${ height + 20}%] ${ isGreen ? 'bg-neon-green/50' : 'bg-neon-red/50' } `}></div>
                              <div
                                className={`w - [80 %] absolute ${ isGreen ? 'bg-neon-green' : 'bg-neon-red' } `}
                                style={{
                                  height: `${ Math.max(2, Math.random() * 20) }% `,
                                  bottom: `${ 30 + Math.random() * 40 }% `
                                }}
                             ></div>
                            </div>
                          )
                        })
                      })()}

                      {/* Current Price Line */}
                      <div className="absolute left-0 right-0 bottom-[50%] border-t border-dashed border-neon-green flex items-center">
                        <div className="bg-neon-green text-black text-[9px] font-bold px-1 absolute right-0">R$ 1.00</div>
                      </div>
                    </div>
                  </div>

                  {/* Market Stats / Info */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-[#151621] border border-[#333] rounded-xl p-5">
                      <h3 className="text-sm font-bold text-white mb-4">Sobre DPIX</h3>
                      <p className="text-xs text-[#888] leading-relaxed mb-4">
                        DPIX é o token utilitário nativo do ecossistema Crypto Tycoon. Utilizado para compra de equipamentos, upgrades e transações no mercado.
                      </p>
                      <div className="flex flex-col gap-2 text-xs">
                        <div className="flex justify-between border-b border-[#333] pb-2">
                          <span className="text-[#666]">Market Cap</span>
                          <span className="text-white font-mono">R$ 10.000.000,00</span>
                        </div>
                        <div className="flex justify-between border-b border-[#333] pb-2">
                          <span className="text-[#666]">Circulating Supply</span>
                          <span className="text-white font-mono">10.000.000 DPIX</span>
                        </div>
                      </div>
                    </div>

                    {/* Recent Trades */}
                    <div className="bg-[#151621] border border-[#333] rounded-xl p-5 flex flex-col">
                      <h3 className="text-sm font-bold text-white mb-4">Trades Recentes</h3>
                      <div className="overflow-hidden relative grow">
                        <div className="absolute inset-0 overflow-y-auto no-scrollbar">
                          <table className="w-full text-left">
                            <thead className="text-[10px] text-[#666] uppercase sticky top-0 bg-[#151621]">
                              <tr>
                                <th className="pb-2">Preço (BRL)</th>
                                <th className="pb-2 text-right">Qtd (DPIX)</th>
                                <th className="pb-2 text-right">Hora</th>
                              </tr>
                            </thead>
                            <tbody className="text-[11px] font-mono">
                              {[...Array(10)].map((_, i) => {
                                const isBuy = Math.random()> 0.5;
                                return (
                                  <tr key={i} className="hover:bg-white/5">
                                    <td className={`py - 1 ${ isBuy ? 'text-neon-green' : 'text-neon-red' } `}>1.00</td>
                                    <td className="py-1 text-right text-white">{(Math.random() * 1000).toFixed(2)}</td>
                                    <td className="py-1 text-right text-[#666]">{new Date(Date.now() - i * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Column: Order Book & Swap */}
                <div className="flex flex-col gap-6">

                  {/* Order Book */}
                  <div className="bg-[#151621] border border-[#333] rounded-xl p-4 h-[300px] flex flex-col">
                    <h3 className="text-xs font-bold text-[#888] uppercase mb-3">Livro de Ofertas</h3>

                    {/* Sells */}
                    <div className="flex-1 overflow-hidden relative">
                      <div className="flex flex-col-reverse justify-end h-full gap-0.5">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="flex justify-between text-[11px] font-mono relative group cursor-pointer hover:bg-white/5 px-1">
                            <div className="absolute inset-0 bg-neon-red/10" style={{ width: `${ Math.random() * 40 }% `, right: 0 }}></div>
                            <span className="text-neon-red relative z-10">1.00</span>
                            <span className="text-white relative z-10">{(Math.random() * 5000).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Spread */}
                    <div className="py-2 my-1 border-y border-[#333] flex justify-between items-center px-1">
                      <span className="text-lg font-bold text-white font-mono">1.00</span>
                      <span className="text-[10px] text-[#666]">Spread: 0.00%</span>
                    </div>

                    {/* Buys */}
                    <div className="flex-1 overflow-hidden relative">
                      <div className="flex flex-col h-full gap-0.5">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="flex justify-between text-[11px] font-mono relative group cursor-pointer hover:bg-white/5 px-1">
                            <div className="absolute inset-0 bg-neon-green/10" style={{ width: `${ Math.random() * 40 }% `, right: 0 }}></div>
                            <span className="text-neon-green relative z-10">1.00</span>
                            <span className="text-white relative z-10">{(Math.random() * 5000).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Swap Interface */}
                  <div className="bg-[#151621] border border-[#333] rounded-xl p-5 flex flex-col gap-4">
                    <div className="flex bg-[#0b0c15] p-1 rounded-lg border border-[#333]">
                      <button
                        onClick={() => setExchangeDirection("brlToDpix")}
                        className={`flex - 1 py - 2 rounded - md text - sm font - bold transition - all ${ exchangeDirection === "brlToDpix" ? "bg-neon-green text-black shadow-lg" : "text-[#888] hover:text-white" } `}
                     >
                        COMPRAR
                      </button>
                      <button
                        onClick={() => setExchangeDirection("dpixToBrl")}
                        className={`flex - 1 py - 2 rounded - md text - sm font - bold transition - all ${ exchangeDirection === "dpixToBrl" ? "bg-neon-red text-white shadow-lg" : "text-[#888] hover:text-white" } `}
                     >
                        VENDER
                      </button>
                    </div>

                    <div className="flex justify-between text-xs text-[#888]">
                      <span>Disponível:</span>
                      <span className="font-bold text-white">
                        {exchangeDirection === "brlToDpix" ? formatBRL(state.wallet) : `${ state.dpix.toFixed(2) } Ð`}
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        value={exchangeDirection === "dpixToBrl" ? sellAmount : buyAmount}
                        onChange={(e) => {
                          setExchangeAmount(e.target.value)
                          if (exchangeDirection === "dpixToBrl") {
                            setSellAmount(e.target.value)
                          } else {
                            setBuyAmount(e.target.value)
                          }
                        }}
                        placeholder="0.00"
                        className="w-full bg-[#0b0c15] border border-[#333] rounded-lg py-3 pl-4 pr-16 text-white font-mono font-bold focus:border-accent outline-none transition-colors"
                      />
                      <span className="absolute right-4 top-3.5 text-xs font-bold text-[#666]">
                        {exchangeDirection === "brlToDpix" ? "BRL" : "DPIX"}
                      </span>
                    </div>

                    <div className="flex justify-center">
                      <i className="fa-solid fa-arrow-down text-[#444]"></i>
                    </div>

                    <div className="bg-[#0b0c15] border border-[#333] rounded-lg p-3 flex justify-between items-center">
                      <span className="text-xs text-[#888]">Você recebe:</span>
                      <div className="text-right">
                        <div className={`font - bold font - mono ${ exchangeDirection === "brlToDpix" ? "text-dpix-color" : "text-neon-green" } `}>
                          {exchangeDirection === "dpixToBrl"
                            ? sellAmount && Number.parseFloat(sellAmount)> 0
                              ? formatBRL(Number.parseFloat(sellAmount) * DPIX_PRICE_BRL * (1 - EXCHANGE_FEE))
                              : "R$ 0.00"
                            : buyAmount && Number.parseFloat(buyAmount)> 0
                              ? `${ (Number.parseFloat(buyAmount) / DPIX_PRICE_BRL).toFixed(2) } Ð`
                              : "0.00 Ð"}
                        </div>
                        {exchangeDirection === "dpixToBrl" && (
                          <div className="text-[10px] text-neon-red">Taxa: 5%</div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (exchangeDirection === "dpixToBrl") {
                          const amount = Number.parseFloat(sellAmount)
                          if (amount> state.dpix) {
                            notify("Saldo insuficiente de DPIX", "error")
                            return
                          }
                          const brl = amount * DPIX_PRICE_BRL
                          const fee = brl * EXCHANGE_FEE
                          const net = brl - fee
                          setExchangeConfirmModal({
                            open: true,
                            type: "dpixToBrl",
                            amount,
                            fee,
                            netReceive: net,
                          })
                        } else {
                          const amount = Number.parseFloat(buyAmount)
                          if (amount> state.wallet) {
                            notify("Saldo insuficiente de BRL", "error")
                            return
                          }
                          const dpix = amount / DPIX_PRICE_BRL
                          setExchangeConfirmModal({
                            open: true,
                            type: "brlToDpix",
                            amount,
                            fee: 0,
                            netReceive: dpix,
                          })
                        }
                      }}
                      className={`w - full py - 3 rounded - lg font - bold uppercase transition - all hover: scale - [1.02] ${
    exchangeDirection === "brlToDpix"
      ? "bg-neon-green text-black hover:shadow-[0_0_20px_rgba(0,230,118,0.4)]"
      : "bg-neon-red text-white hover:shadow-[0_0_20px_rgba(255,82,82,0.4)]"
  } `}
                   >
                      {exchangeDirection === "brlToDpix" ? "Comprar DPIX" : "Vender DPIX"}
                    </button>

                  </div>
                </div>

              </div>
            </div>
          )}

          {activeView === "referrals" && (
            <div className="p-8 animate-slide-in max-w-6xl mx-auto w-full pb-20">

              {/* HEADER HERO */}
              <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-2xl p-8 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="max-w-xl">
                    <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                      <i className="fa-solid fa-users-viewfinder text-blue-400"></i> Programa de Afiliados
                    </h2>
                    <p className="text-blue-200/80 text-sm leading-relaxed mb-6">
                      Convide amigos e ganhe comissões vitalícias sobre toda a mineração deles. Construa sua própria rede de mineração passiva!
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 bg-[#0b0c15] border border-blue-500/30 rounded-lg flex items-center p-1 pl-4 relative group">
                        <div className="text-xs text-[#666] absolute -top-2.5 left-3 bg-[#0b0c15] px-1">SEU LINK DE CONVITE</div>
                        <input
                          type="text"
                          readOnly
                          value={`https://cryptotycoon.pro/r/${state.referral.code}`}
  className = "bg-transparent border-none text-blue-400 font-mono text-sm w-full outline-none"
    />
    <button
      onClick={() => {
        navigator.clipboard.writeText(`https://cryptotycoon.pro/r/${state.referral.code}`)
        notify("Link copiado!", "info")
      }}
      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-bold text-xs transition-all ml-2"
    >
      COPIAR
    </button>
                      </div >
  <button
    className="bg-[#1da1f2] hover:bg-[#1a91da] text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
    onClick={() => window.open(`https://twitter.com/intent/tweet?text=Venha%20minerar%20comigo%20no%20Crypto%20Tycoon!%20Use%20meu%20código:%20${state.referral.code}&url=https://cryptotycoon.pro/r/${state.referral.code}`, '_blank')}
  >
    <i className="fa-brands fa-twitter"></i> Compartilhar
  </button>
                    </div >
                  </div >

  {/* Quick Stats Circle */ }
  < div className = "relative w-40 h-40 flex items-center justify-center shrink-0" >
                    <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full border-t-blue-500 animate-spin-slow"></div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white font-mono">{state.referral.users.lvl1 + state.referral.users.lvl2 + state.referral.users.lvl3}</div>
                      <div className="text-[10px] text-blue-300 uppercase tracking-widest">Indicados</div>
                    </div>
                  </div >
                </div >
              </div >

  {/* STATS CARDS */ }
  < div className = "grid grid-cols-1 md:grid-cols-3 gap-6 mb-8" >
    {/* Total Earned */ }
    < div className = "bg-card-bg border border-border-color rounded-xl p-6 relative overflow-hidden group" >
                  <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <i className="fa-solid fa-sack-dollar text-6xl text-white"></i>
                  </div>
                  <div className="text-xs text-[#888] uppercase tracking-wider font-bold mb-2">Comissões Totais</div>
                  <div className="text-2xl font-bold text-neon-green font-mono">{formatBRL(state.referral.totalEarned)}</div>
                  <div className="text-[11px] text-[#666] mt-1">Ganho Vitalício</div>
                </div >

  {/* Available Balance */ }
  < div className = "bg-card-bg border border-border-color rounded-xl p-6 relative overflow-hidden group" >
                  <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <i className="fa-solid fa-wallet text-6xl text-white"></i>
                  </div>
                  <div className="text-xs text-[#888] uppercase tracking-wider font-bold mb-2">Saldo Disponível</div>
                  <div className="text-2xl font-bold text-white font-mono">{formatBRL(state.referral.balance)}</div>
                  <button
                    onClick={() => {
                      if (state.referral.balance> 0) {
                        setState((p) => ({
                          ...p,
                          wallet: p.wallet + p.referral.balance,
                          referral: { ...p.referral, balance: 0 },
                        }))
                        notify(`Resgatado ${formatBRL(state.referral.balance)} para carteira!`, "success")
                      } else notify("Sem saldo para resgatar", "error")
                    }}
                    disabled={state.referral.balance <= 0}
                    className="mt-3 w-full bg-neon-green/10 hover:bg-neon-green/20 text-neon-green border border-neon-green/30 py-2 rounded text-xs font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    Resgatar
                  </button>
                </div >

  {/* Network Size */ }
  < div className = "bg-card-bg border border-border-color rounded-xl p-6 relative overflow-hidden group" >
                  <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <i className="fa-solid fa-network-wired text-6xl text-white"></i>
                  </div>
                  <div className="text-xs text-[#888] uppercase tracking-wider font-bold mb-2">Rede Ativa</div>
                  <div className="flex items-end gap-2">
                    <div className="text-2xl font-bold text-white font-mono">{state.referral.users.lvl1}</div>
                    <div className="text-xs text-[#666] mb-1.5">Diretos</div>
                  </div>
                  <div className="w-full bg-[#222] h-1.5 rounded-full mt-3 overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: '100%' }}></div>
                  </div>
                </div >
              </div >

  {/* TIERS EXPLANATION */ }
  < h3 className = "text-white font-bold mb-4 flex items-center gap-2" >
    <i className="fa-solid fa-layer-group text-[#888]"></i> Estrutura de Comissões
              </h3 >
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    {/* Level 1 */}
    <div className="bg-[#151621] border border-neon-green/30 rounded-xl p-5 relative">
      <div className="absolute -top-3 left-4 bg-[#151621] px-2 text-neon-green text-xs font-bold border border-neon-green/30 rounded">NÍVEL 1</div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-lg font-bold text-white">5%</div>
          <div className="text-[10px] text-[#888]">dos depósitos</div>
        </div>
        <i className="fa-solid fa-user text-neon-green text-xl bg-neon-green/10 p-2 rounded-lg"></i>
      </div>
      <div className="text-xs text-[#aaa] leading-relaxed">
        Receba 5% de tudo que seus indicados diretos depositarem ou minerarem.
      </div>
      <div className="mt-4 pt-4 border-t border-[#333] flex justify-between items-center">
        <span className="text-[10px] text-[#666] uppercase font-bold">Seus Indicados</span>
        <span className="text-white font-mono font-bold">{state.referral.users.lvl1}</span>
      </div>
    </div>

    {/* Level 2 */}
    <div className="bg-[#151621] border border-neon-yellow/30 rounded-xl p-5 relative">
      <div className="absolute -top-3 left-4 bg-[#151621] px-2 text-neon-yellow text-xs font-bold border border-neon-yellow/30 rounded">NÍVEL 2</div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-lg font-bold text-white">3%</div>
          <div className="text-[10px] text-[#888]">dos depósitos</div>
        </div>
        <i className="fa-solid fa-user-group text-neon-yellow text-xl bg-neon-yellow/10 p-2 rounded-lg"></i>
      </div>
      <div className="text-xs text-[#aaa] leading-relaxed">
        Ganhe 3% sobre os indicados dos seus indicados. A rede cresce sozinha!
      </div>
      <div className="mt-4 pt-4 border-t border-[#333] flex justify-between items-center">
        <span className="text-[10px] text-[#666] uppercase font-bold">Seus Indicados</span>
        <span className="text-white font-mono font-bold">{state.referral.users.lvl2}</span>
      </div>
    </div>

    {/* Level 3 */}
    <div className="bg-[#151621] border border-neon-red/30 rounded-xl p-5 relative">
      <div className="absolute -top-3 left-4 bg-[#151621] px-2 text-neon-red text-xs font-bold border border-neon-red/30 rounded">NÍVEL 3</div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-lg font-bold text-white">1%</div>
          <div className="text-[10px] text-[#888]">dos depósitos</div>
        </div>
        <i className="fa-solid fa-users text-neon-red text-xl bg-neon-red/10 p-2 rounded-lg"></i>
      </div>
      <div className="text-xs text-[#aaa] leading-relaxed">
        Ganhe 1% até o terceiro nível de profundidade. Renda passiva real.
      </div>
      <div className="mt-4 pt-4 border-t border-[#333] flex justify-between items-center">
        <span className="text-[10px] text-[#666] uppercase font-bold">Seus Indicados</span>
        <span className="text-white font-mono font-bold">{state.referral.users.lvl3}</span>
      </div>
    </div>
  </div>

            </div >
          )}
        </div >
  <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none">
    {toasts.map((t) => (
      <div
        key={t.id}
        className={`bg-[#151621]/95 border-l-4 text-white px-5 py-4 rounded shadow-lg min-w-[300px] backdrop-blur pointer-events-auto animate-slide-in flex items-center justify-between text-[13px] ${t.type === "success" ? "border-neon-green" : t.type === "error" ? "border-neon-red" : "border-dpix-color"
          }`}
      >
        <div className="flex items-center gap-2.5">
          {t.type === "success" && <i className="fa-solid fa-check-circle text-neon-green"></i>}
          {t.type === "error" && <i className="fa-solid fa-circle-xmark text-neon-red"></i>}
          {t.type === "info" && <i className="fa-solid fa-info-circle text-dpix-color"></i>}
          <span>{t.msg}</span>
        </div>
      </div>
    ))}
  </div>
{
  notification && (
    <div
      className={`fixed bottom-5 right-5 z-[9999] bg-[#151621]/95 border-l-4 text-white px-5 py-4 rounded shadow-lg min-w-[300px] backdrop-blur pointer-events-auto animate-slide-in flex items-center gap-2.5 text-[13px] border-${notification.color} `}
    >
      <i
        className={`fa-solid ${notification.color === "red"
          ? "fa-circle-xmark text-red-500"
          : notification.color === "green"
            ? "fa-check-circle text-green-500"
            : "fa-info-circle text-blue-500"
          }`}
      ></i>
      {notification.message}
    </div>
  )
}
{
  buyModal && (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
      <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-lg font-bold text-white mb-1">{buyModal.item.name}</div>
          <div className="text-xs text-[#888] uppercase">
            {buyModal.item.isSpecial
              ? "Mineradora Especial (Skin)"
              : buyModal.type === "room"
                ? "Quarto"
                : buyModal.type === "shelf"
                  ? "Prateleira"
                  : "Mineradora"}{" "}
            • {buyModal.item.tier}
          </div>
          {buyModal.item.tier === "box" && (
            <div className="mt-1 text-[11px] text-[#aaa]">
              Probabilidades:
              <br />
              Basic: 60% | Comum: 25% | Raro: 10%
              <br />
              Épico: 4% | Lendário: 1%
            </div>
          )}
          {buyModal.item.desc && <div className="text-[11px] text-[#aaa] mt-2 italic">"{buyModal.item.desc}"</div>}
          {buyModal.item.isSpecial && (
            <div className="mt-1 text-tier-special text-[11px]">Item exclusivo comprado com DPIX</div>
          )}
        </div>
        <div className="bg-[#111] p-4 rounded-lg flex justify-between items-center border border-[#333]">
          <span className="text-[#aaa]">Preço:</span>
          <span className="font-bold text-lg text-dpix-color">Ð {buyModal.item.price}</span>
        </div>
        {buyModal.type === "room" && !buyModal.item.isSpecial && !buyModal.item.subtype && (
          <div className="mt-1 text-[11px] text-[#aaa] text-right">Aluguel: R$ {buyModal.item.rent}/12h</div>
        )}
        <div className="mt-2.5 text-[11px] text-[#666] text-center">Seu saldo: {state.dpix.toFixed(2)} DPIX</div>
        <div className="flex justify-end gap-2.5 mt-5">
          <button
            onClick={() => setBuyModal(null)}
            className="bg-transparent border border-[#555] text-[#aaa] px-4 py-1.5 rounded text-xs font-bold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              handleBuy(buyModal.item, buyModal.type)
              setBuyModal(null)
            }}
            className="bg-neon-green text-black border-none px-4 py-1.5 rounded text-xs font-bold cursor-pointer hover:scale-105 transition-all"
          >
            CONFIRMAR
          </button>
        </div>
      </div>
    </div>
  )
}
{
  payModal && (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
      <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
        <div className="text-center mb-5 text-white font-bold text-lg flex flex-col items-center">
          <i className="fa-solid fa-bolt text-neon-orange mb-2 text-2xl"></i>
          Pagar Energia
        </div>

        <div className="text-center mb-5">
          <div className="text-base text-white font-bold">
            {ITEMS_DB.room.find((r) => r.id === state.inventory.find((i) => i.uid === payModal.roomUid)?.id)?.name}
          </div>
        </div>

        <div className="bg-[#111] border border-[#333] rounded-lg p-4 mb-4">
          <div className="flex justify-between mb-1.5">
            <span className="text-[#aaa]">Custo (12h):</span>
            <span className="text-neon-orange font-bold">
              Ð{" "}
              {
                ITEMS_DB.room.find((r) => r.id === state.inventory.find((i) => i.uid === payModal.roomUid)?.id)
                  ?.rent
              }
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#666]">Seu Saldo (DPIX):</span>
            <span className="text-neon-green">Ð {state.dpix.toFixed(2)}</span>
          </div>
        </div>
        <div className="text-[11px] text-[#888] text-center mb-5">
          Isso irá restaurar o timer de energia para 12 horas.
        </div>

        <div className="flex justify-end gap-2.5 mt-5">
          <button
            onClick={() => setPayModal(null)}
            className="bg-transparent border border-[#555] text-[#aaa] px-4 py-2 rounded text-sm font-bold cursor-pointer hover:bg-[#2a2d3a] transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={processPayRent}
            className="bg-neon-orange text-black border-none px-4 py-2 rounded text-sm font-bold cursor-pointer hover:bg-orange-400 transition-all"
          >
            PAGAR AGORA
          </button>
        </div>
      </div>
    </div>
  )
}
{
  payAllModal && (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
      <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
        <div className="text-center mb-5 text-white font-bold text-lg flex flex-col items-center">
          <i className="fa-solid fa-bolt text-neon-yellow mb-2 text-3xl animate-pulse"></i>
          Confirmar Pagamento em Massa
        </div>

        <div className="text-center mb-5">
          <div className="text-base text-white font-bold">
            Setor {payAllModal.rarity.charAt(0).toUpperCase() + payAllModal.rarity.slice(1)}
          </div>
          <div className="text-sm text-[#aaa] mt-1">
            {payAllModal.count} {payAllModal.count === 1 ? "quarto precisa" : "quartos precisam"} de energia
          </div>
        </div>

        <div className="bg-[#111] border border-[#333] rounded-lg p-4 mb-4">
          <div className="flex justify-between mb-1.5">
            <span className="text-[#aaa]">Custo Total (12h cada):</span>
            <span className="text-neon-orange font-bold text-lg">Ð {payAllModal.total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#666]">Seu Saldo (DPIX):</span>
            <span className={state.dpix >= payAllModal.total ? "text-neon-green" : "text-red-500"}>
              Ð {state.dpix.toFixed(2)}
            </span>
          </div>
          {state.dpix < payAllModal.total && (
            <div className="text-xs text-red-500 mt-2 text-center">
              Saldo insuficiente! Faltam: Ð {(payAllModal.total - state.dpix).toFixed(2)}
            </div>
          )}
        </div>
        <div className="text-[11px] text-[#888] text-center mb-5">
          Isso irá renovar a energia de todos os {payAllModal.count} quartos para 12 horas cada.
        </div>

        <div className="flex justify-end gap-2.5 mt-5">
          <button
            onClick={() => setPayAllModal(null)}
            className="bg-transparent border border-[#555] text-[#aaa] px-4 py-2 rounded text-sm font-bold cursor-pointer hover:bg-[#2a2d3a] transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={processPayAllEnergy}
            disabled={state.dpix < payAllModal.total}
            className="bg-gradient-to-r from-neon-yellow to-neon-orange text-black border-none px-6 py-2 rounded text-sm font-bold cursor-pointer hover:shadow-[0_0_20px_rgba(255,193,7,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-bolt mr-2"></i>
            CONFIRMAR PAGAMENTO
          </button>
        </div>
      </div>
    </div>
  )
}
{
  installModal && (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
      <div className="bg-card-bg border border-border-color p-6 rounded-xl w-[90%] max-w-[500px] shadow-2xl">
        <div className="text-lg font-bold text-white mb-4">Instalar Item</div>
        <div className="text-[#aaa] text-sm mb-2">Selecione um item do inventário:</div>
        <div className="max-h-[300px] overflow-y-auto flex flex-col gap-2.5 my-4">
          {state.inventory.filter((i) => i.type === installModal.typeNeeded && i.parentId === null).length === 0 ? (
            <div className="text-[#888] text-center py-4">
              Sem itens disponíveis.
              <br />
              Vá ao Mercado comprar.
            </div>
          ) : (
            state.inventory
              .filter((i) => i.type === installModal.typeNeeded && i.parentId === null)
              .map((item) => {
                const db = ITEMS_DB[item.type].find((x) => x.id === item.id)
                const health = item.health ?? 100
                const isBroken = health <= 0

                return (
                  <div
                    key={item.uid}
                    className={`p-2.5 border rounded bg-[#111] flex justify-between items-center ${isBroken ? "border-red-500 opacity-60" : "border-[#333] hover:border-accent"
                      } group relative`}
                    style={{ borderLeft: `3px solid ${isBroken ? "#ff5252" : getTierColor(db?.tier || "basic")}` }}
                  >
                    <div className="flex-1">
                      <div
                        className={`font-bold ${isBroken ? "text-red-500" : "text-white group-hover:text-accent"} transition-colors flex items-center gap-2`}
                      >
                        {db?.name}
                        {isBroken && (
                          <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded uppercase font-bold">
                            Superaquecida
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#888] uppercase">{db?.tier}</div>
                      {item.type === "miner" && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <i
                            className={`fa-solid fa-temperature-${isBroken ? "full" : health > 50 ? "low" : health > 20 ? "half" : "high"} text-[10px]`}
                            style={{
                              color: isBroken
                                ? "#ff5252"
                                : health > 50
                                  ? "#00e676"
                                  : health > 20
                                    ? "#ffea00"
                                    : "#ff5252",
                            }}
                          ></i>
                          <div className="w-20 h-1.5 bg-black/50 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${health > 50 ? "bg-green-500" : health > 20 ? "bg-yellow-500" : "bg-red-600"
                                }`}
                              style={{ width: `${health}%` }}
                            ></div>
                          </div>
                          <span
                            className="text-[10px] font-mono"
                            style={{
                              color: isBroken
                                ? "#ff5252"
                                : health > 50
                                  ? "#00e676"
                                  : health > 20
                                    ? "#ffea00"
                                    : "#ff5252",
                            }}
                          >
                            {health.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                    {isBroken ? (
                      <button
                        onClick={() => {
                          handleRepairRequest([item.uid])
                        }}
                        className="bg-neon-orange text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-orange-400 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <i className="fa-solid fa-wrench"></i>
                        MANUTENÇÃO (Ð 50)
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(item.uid)}
                        className="border border-neon-green text-neon-green px-3 py-1 rounded text-xs font-bold hover:bg-neon-green hover:text-black cursor-pointer"
                      >
                        INSTALAR
                      </button>
                    )}
                  </div>
                )
              })
          )}
        </div>
        <div className="text-right">
          <button
            onClick={() => setInstallModal(null)}
            className="bg-transparent border border-[#555] text-[#aaa] px-4 py-1.5 rounded text-xs font-bold cursor-pointer hover:bg-white hover:text-black"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
{
  bankModal && (
    <BankModal
      type={bankModal.type}
      balance={state.wallet}
      createdAt={state.createdAt}
      onClose={() => setBankModal(null)}
      onConfirm={handleBankAction}
    />
  )
}
{ boxAnim && <BoxOpeningModal wonItem={boxAnim.wonItem} tier={boxAnim.tier} onClose={() => setBoxAnim(null)} /> }
{
  demolishModal?.show && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-red-500/30 rounded-lg p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <i className="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
          <h3 className="text-xl font-bold text-red-500">Confirmar Demolição</h3>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-gray-300">Você está prestes a demolir o quarto:</p>
          <p className="text-center text-xl font-bold text-white bg-gray-800 p-3 rounded border border-gray-700">
            {demolishModal.roomName}
          </p>
          <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
            <p className="text-green-400 text-center">
              Você receberá: <span className="font-bold text-lg">Ð 8.00</span>
            </p>
          </div>
          <p className="text-red-400 text-sm text-center font-semibold">⚠ Esta ação é irreversível!</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setDemolishModal(null)}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmDemolish}
            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded font-semibold transition-colors"
          >
            Demolir
          </button>
        </div>
      </div>
    </div>
  )
}
{
  exchangeModal.open && (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f1015] border-2 border-dpix-color rounded-lg p-6 max-w-md w-full shadow-[0_0_40px_rgba(217,70,239,0.3)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-exchange-alt text-dpix-color"></i>
            {exchangeModal.mode === "dpix-to-brl" ? "DPIX → BRL" : "BRL → DPIX"}
          </h2>
          <button
            onClick={() => {
              setExchangeModal({ open: false, mode: null })
              setExchangeAmount("")
            }}
            className="text-[#888] hover:text-white transition-colors"
          >
            <i className="fa-solid fa-times text-xl"></i>
          </button>
        </div>

        <div className="space-y-4">
          {/* Informações da Cotação */}
          <div className="bg-[#1a1a2e] border border-border-color rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Taxa de Câmbio:</span>
              <span className="text-white font-bold">
                {exchangeModal.mode === "dpix-to-brl" ? "100 DPIX = R$ 1,00" : "R$ 1,00 = 100 DPIX"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Taxa de Serviço:</span>
              <span className="text-yellow-400 font-bold">2%</span>
            </div>
            <div className="flex justify-between text-sm border-t border-border-color pt-2">
              <span className="text-gray-400">Seu Saldo:</span>
              <span className="text-neon-green font-bold font-mono">
                {exchangeModal.mode === "dpix-to-brl" ? `Ð ${state.dpix.toFixed(2)}` : formatBRL(state.wallet)}
              </span>
            </div>
          </div>

          {/* Input de Valor */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Quanto deseja converter?</label>
            <input
              type="number"
              value={exchangeAmount}
              onChange={(e) => {
                setExchangeAmount(e.target.value)
              }}
              placeholder={exchangeModal.mode === "dpix-to-brl" ? "Digite DPIX" : "Digite BRL"}
              className="w-full bg-[#1a1a2e] border border-border-color rounded-lg px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-dpix-color"
              step="0.01"
              min="0"
              autoFocus
            />
          </div>

          {/* Preview da Conversão */}
          {exchangeAmount && Number.parseFloat(exchangeAmount) > 0 && (
            <div className="bg-[#1a1a2e] border border-dpix-color/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Você está convertendo:</span>
                <span className="text-white font-bold">
                  {exchangeModal.mode === "dpix-to-brl"
                    ? `Ð ${Number.parseFloat(exchangeAmount).toFixed(2)}`
                    : `R$ ${Number.parseFloat(exchangeAmount).toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Taxa (2%):</span>
                <span className="text-yellow-400 font-bold">
                  {exchangeModal.mode === "dpix-to-brl"
                    ? `R$ ${((Number.parseFloat(exchangeAmount) / EXCHANGE_RATE) * CURRENT_EXCHANGE_FEE).toFixed(2)}`
                    : `R$ ${(Number.parseFloat(exchangeAmount) * CURRENT_EXCHANGE_FEE).toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t border-dpix-color/30 pt-2">
                <span className="text-gray-400">Você receberá:</span>
                <span className="text-neon-green font-bold text-lg">
                  {exchangeModal.mode === "dpix-to-brl"
                    ? `R$ ${((Number.parseFloat(exchangeAmount) / EXCHANGE_RATE) * (1 - CURRENT_EXCHANGE_FEE)).toFixed(2)}`
                    : `Ð ${(Number.parseFloat(exchangeAmount) * (1 - CURRENT_EXCHANGE_FEE) * EXCHANGE_RATE).toFixed(2)}`}
                </span>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setExchangeModal({ open: false, mode: null })
                setExchangeAmount("")
              }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleExchangeSubmit}
              className="flex-1 bg-gradient-to-r from-dpix-color to-purple-600 hover:from-purple-600 hover:to-dpix-color text-white py-3 rounded-lg font-bold transition-all shadow-[0_0_20px_rgba(217,70,239,0.3)]"
            >
              <i className="fa-solid fa-check mr-2"></i>
              Converter
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
{
  exchangeConfirmModal?.open && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1015] border-2 border-dpix-color rounded-lg p-6 max-w-md w-full shadow-[0_0_40px_rgba(217,70,239,0.3)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-circle-exclamation text-yellow-400"></i>
            Confirmar Conversão
          </h2>
          <button onClick={() => setExchangeConfirmModal(null)} className="text-gray-400 hover:text-white text-xl">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-gray-300">
            Você deseja converter{" "}
            <span className="font-bold text-white">
              {exchangeConfirmModal.type === "dpixToBrl"
                ? `${exchangeConfirmModal.amount.toFixed(2)} DPIX`
                : `R$ ${exchangeConfirmModal.amount.toFixed(2)}`}
            </span>
            ?
          </p>

          <div className="bg-[#1a1a2e] border border-border-color rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Você receberá:</span>
              <span className="text-neon-green font-bold text-lg">
                {exchangeConfirmModal.type === "dpixToBrl"
                  ? `R$ ${exchangeConfirmModal.netReceive.toFixed(2)}`
                  : `Ð ${exchangeConfirmModal.netReceive.toFixed(2)}`}
              </span>
            </div>
            {exchangeConfirmModal.type === "dpixToBrl" && exchangeConfirmModal.fee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Taxa (5%):</span>
                <span className="text-yellow-400 font-bold">{formatBRL(exchangeConfirmModal.fee)}</span>
              </div>
            )}
          </div>
          {exchangeConfirmModal.type === "dpixToBrl" && (
            <p className="text-yellow-400 text-sm text-center font-semibold">Taxa de conversão DPIX → BRL: 5%</p>
          )}
          {exchangeConfirmModal.type === "brlToDpix" && (
            <p className="text-neon-green text-sm text-center font-semibold">Conversão BRL → DPIX sem taxa!</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setExchangeConfirmModal(null)}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              // Perform the exchange based on the type
              if (exchangeConfirmModal.type === "dpixToBrl") {
                setState((prev) => ({
                  ...prev,
                  wallet: prev.wallet + exchangeConfirmModal.netReceive,
                  dpix: prev.dpix - exchangeConfirmModal.amount,
                }))
                addLog("Conversão DPIX→BRL", exchangeConfirmModal.netReceive, "in")
                notify(`Recebido: ${formatBRL(exchangeConfirmModal.netReceive)}`, "success")
                setSellAmount("")
              } else {
                setState((prev) => ({
                  ...prev,
                  wallet: prev.wallet - exchangeConfirmModal.amount,
                  dpix: prev.dpix + exchangeConfirmModal.netReceive,
                }))
                addLog("Conversão BRL→DPIX", exchangeConfirmModal.amount, "out")
                notify(`Recebido: ${exchangeConfirmModal.netReceive.toFixed(2)} DPIX`, "success")
                setBuyAmount("")
              }
              setExchangeConfirmModal(null)
              setExchangeAmount("") // Clear input
            }}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-dpix-color to-purple-600 hover:from-purple-600 hover:to-dpix-color text-white rounded font-semibold transition-all"
          >
            Confirmar Conversão
          </button>
        </div>
      </div>
    </div>
  )
}
{/* NEW: Buy Confirmation Modal */ }
{
  buyConfirmModal && buyConfirmModal.show && buyConfirmModal.item && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[#0f1015] border border-accent/30 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent"></div>

        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <i className="fa-solid fa-cart-shopping text-accent"></i> Confirmar Compra
        </h3>

        <div className="bg-[#1a1a2e] rounded-xl p-4 mb-6 border border-white/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded bg-[#111] border border-[#333] flex items-center justify-center">
              {buyConfirmModal.type === 'miner' ? <i className="fa-solid fa-microchip text-xl text-[#888]"></i> :
                buyConfirmModal.type === 'room' ? <i className="fa-solid fa-warehouse text-xl text-[#888]"></i> :
                  <i className="fa-solid fa-box text-xl text-[#888]"></i>}
            </div>
            <div>
              <div className="text-xs text-[#888] uppercase font-bold">{getTierLabel(buyConfirmModal.item.tier)}</div>
              <div className="text-white font-bold">{buyConfirmModal.item.name}</div>
            </div>
          </div>

          <div className="flex justify-between items-center text-sm border-t border-white/5 pt-3">
            <span className="text-[#aaa]">Preço:</span>
            <span className="text-white font-bold font-mono">Ð {buyConfirmModal.item.price.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setBuyConfirmModal(null)}
            className="flex-1 py-3 rounded-lg font-bold text-sm bg-[#222] text-[#888] hover:bg-[#333] hover:text-white transition-colors"
          >
            CANCELAR
          </button>
          <button
            onClick={confirmPurchase}
            className="flex-1 py-3 rounded-lg font-bold text-sm bg-accent text-black hover:bg-white transition-colors shadow-[0_0_20px_rgba(0,255,153,0.2)]"
          >
            CONFIRMAR
          </button>
        </div>
      </div>
    </div>
  )
}
{/* Recycle Confirmation Modal */ }
{
  recycleModal && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[#0f1015] border border-neon-orange/30 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(255,153,0,0.2)]">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <i className="fa-solid fa-recycle text-neon-orange"></i> Confirmar Reciclagem
        </h3>
        <p className="text-[#aaa] mb-4">
          Você vai reciclar <strong className="text-white">{recycleModal.items.length} itens</strong>.
          <br />
          Valor total a receber:
        </p>
        <div className="bg-[#1a1a2e] rounded-xl p-4 mb-6 border border-neon-orange/20 text-center">
          <span className="text-neon-orange font-bold text-2xl font-mono">+ Ð {recycleModal.totalValue}</span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setRecycleModal(null)} className="flex-1 py-3 rounded-lg font-bold text-sm bg-[#222] text-[#888] hover:bg-[#333] hover:text-white transition-colors">CANCELAR</button>
          <button onClick={confirmRecycle} className="flex-1 py-3 rounded-lg font-bold text-sm bg-neon-orange text-black hover:bg-white transition-colors">CONFIRMAR</button>
        </div>
      </div>
    </div>
  )
}
{/* Repair Confirmation Modal */ }
{
  repairModal && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[#0f1015] border border-neon-blue/30 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(0,255,255,0.2)]">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <i className="fa-solid fa-wrench text-neon-blue"></i> Confirmar Reparo
        </h3>
        <p className="text-[#aaa] mb-4">
          Reparar <strong className="text-white">{repairModal.items.length} mineradoras</strong>.
          <br />
          Custo total:
        </p>
        <div className="bg-[#1a1a2e] rounded-xl p-4 mb-6 border border-neon-blue/20 text-center">
          <span className="text-neon-blue font-bold text-2xl font-mono">- Ð {repairModal.totalCost}</span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setRepairModal(null)} className="flex-1 py-3 rounded-lg font-bold text-sm bg-[#222] text-[#888] hover:bg-[#333] hover:text-white transition-colors">CANCELAR</button>
          <button onClick={confirmRepair} className="flex-1 py-3 rounded-lg font-bold text-sm bg-neon-blue text-black hover:bg-white transition-colors">CONFIRMAR</button>
        </div>
      </div>
    </div>
  )
}
      </div >
    </div >
  )
}

export default App

// --- INVENTORY VIEW COMPONENT ---
function InventoryView({ inventory, onUninstall, onRequestRecycle, onRequestRepair, setActiveView, notify }) {
  const [filter, setFilter] = useState({
    category: "all",
    status: "all",
    condition: "all",
    sort: "rarity_desc",
  })
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedItems, setSelectedItems] = useState<string[]>([])

  // Process Inventory (Filter -> Sort -> Group)
  const processedInventory = useMemo(() => {
    let items = [...inventory].filter((i) => i.type !== "room") // Rooms are managed in dashboard

    // 1. Filter
    if (filter.category !== "all") {
      items = items.filter((i) => i.type === filter.category)
    }
    if (filter.status !== "all") {
      items = items.filter((i) => (filter.status === "used" ? i.parentId : !i.parentId))
    }
    if (filter.condition === "broken") {
      items = items.filter((i) => i.type === "miner" && (i.health ?? 100) <= 0)
    }

    // 2. Sort
    items.sort((a, b) => {
      // Priority: Broken items last
      const aBroken = a.type === 'miner' && (a.health ?? 100) <= 0;
      const bBroken = b.type === 'miner' && (b.health ?? 100) <= 0;
      if (aBroken && !bBroken) return 1;
      if (!aBroken && bBroken) return -1;

      const dbA = ITEMS_DB[a.type]?.find((x) => x.id === a.id)
      const dbB = ITEMS_DB[b.type]?.find((x) => x.id === b.id)
      const tierOrder: Record<string, number> = { legendary: 6, special: 5, epic: 4, rare: 3, common: 2, basic: 1 }

      if (filter.sort === "rarity_desc") {
        return (tierOrder[dbB?.tier || "basic"] || 0) - (tierOrder[dbA?.tier || "basic"] || 0)
      }
      if (filter.sort === "rarity_asc") {
        return (tierOrder[dbA?.tier || "basic"] || 0) - (tierOrder[dbB?.tier || "basic"] || 0)
      }
      return 0
    })

    // 3. Group (Stacking)
    const grouped = []
    const processedIds = new Set()

    items.forEach((item) => {
      if (item.parentId) {
        // Installed items are NEVER grouped
        grouped.push({ ...item, count: 1, isGroup: false })
      } else {
        // Stored items ARE grouped by ID + Health
        if (processedIds.has(item.uid)) return // Already processed in a group

        // Find all identical stored items (Same ID, Same Type, Same Health)
        const group = items.filter((i) => {
          if (i.parentId) return false;
          if (i.id !== item.id || i.type !== item.type) return false;
          // For miners, check health equality
          if (i.type === 'miner') {
            return (i.health ?? 100) === (item.health ?? 100);
          }
          return true;
        })

        if (group.length > 0 && !processedIds.has(group[0].uid)) {
          // Only add the group once (using the first item as representative)
          if (item.uid === group[0].uid) {
            grouped.push({ ...item, count: group.length, isGroup: true, groupItems: group })
            group.forEach(g => processedIds.add(g.uid))
          }
        }
      }
    })

    return grouped
  }, [inventory, filter])

  const toggleSelection = (uid) => {
    if (selectedItems.includes(uid)) {
      setSelectedItems(selectedItems.filter((id) => id !== uid))
    } else {
      setSelectedItems([...selectedItems, uid])
    }
  }

  const handleBulkRecycle = () => {
    onRequestRecycle(selectedItems);
    setSelectedItems([]);
    setSelectionMode(false);
  }

  const handleBulkRepair = () => {
    const minersToRepair = selectedItems.filter(uid => {
      const item = inventory.find(i => i.uid === uid);
      return item && item.type === 'miner';
    });

    if (minersToRepair.length === 0) {
      notify("Nenhuma mineradora selecionada para reparo.", "info");
      return;
    }

    onRequestRepair(minersToRepair);
    setSelectedItems([]);
    setSelectionMode(false);
  }

  return (
    <div className="p-8 animate-slide-in max-w-7xl mx-auto w-full pb-32">
      <div className="flex flex-wrap justify-between items-end mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-boxes-stacked text-accent"></i> Gestão de Ativos
          </h2>
          <p className="text-[#888] text-sm mt-1">
            Gerencie seu inventário com eficiência. {inventory.length} itens totais.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectionMode(!selectionMode)
              setSelectedItems([])
            }}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase transition-all border ${selectionMode ? 'bg-neon-blue text-white border-neon-blue' : 'bg-[#222] text-[#888] border-[#333] hover:text-white'}`}
          >
            <i className="fa-solid fa-check-double mr-2"></i>
            {selectionMode ? 'Cancelar Seleção' : 'Selecionar Vários'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#151621] border border-[#333] rounded-xl p-4 mb-6 flex flex-wrap gap-6 items-center shadow-lg">

        {/* Category */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold text-[#666]">Categoria</span>
          <div className="flex bg-[#0b0c15] rounded-lg p-1 border border-[#333]">
            {[{ id: 'all', l: 'Tudo' }, { id: 'miner', l: 'Mineradoras' }, { id: 'shelf', l: 'Racks' }, { id: 'skin', l: 'Skins' }].map(c => (
              <button
                key={c.id}
                onClick={() => setFilter({ ...filter, category: c.id })}
                className={`px-3 py-1.5 rounded text-[11px] font-bold transition-all ${filter.category === c.id ? 'bg-[#222] text-white shadow-sm' : 'text-[#666] hover:text-[#888]'}`}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold text-[#666]">Estado</span>
          <div className="flex bg-[#0b0c15] rounded-lg p-1 border border-[#333]">
            {[{ id: 'all', l: 'Todos' }, { id: 'used', l: 'Em Uso' }, { id: 'stored', l: 'Guardados' }].map(s => (
              <button
                key={s.id}
                onClick={() => setFilter({ ...filter, status: s.id })}
                className={`px-3 py-1.5 rounded text-[11px] font-bold transition-all ${filter.status === s.id ? 'bg-[#222] text-white shadow-sm' : 'text-[#666] hover:text-[#888]'}`}
              >
                {s.l}
              </button>
            ))}
          </div>
        </div>

        {/* Condition */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold text-[#666]">Condição</span>
          <div className="flex bg-[#0b0c15] rounded-lg p-1 border border-[#333]">
            {[{ id: 'all', l: 'Qualquer' }, { id: 'broken', l: 'Quebrados ⚠️' }].map(c => (
              <button
                key={c.id}
                onClick={() => setFilter({ ...filter, condition: c.id })}
                className={`px-3 py-1.5 rounded text-[11px] font-bold transition-all ${filter.condition === c.id ? 'bg-neon-red/20 text-neon-red shadow-sm' : 'text-[#666] hover:text-[#888]'}`}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
        {processedInventory.map(item => {
          const dbItem = ITEMS_DB[item.type]?.find(x => x.id === item.id);
          if (!dbItem) return null;

          const isSelected = selectedItems.includes(item.uid);
          const isInstalled = !!item.parentId;
          const health = item.health ?? 100;
          const isBroken = item.type === 'miner' && health <= 0;
          const daysRemaining = Math.floor((health / 100) * 30);
          const specs = MINER_SPECS[dbItem.tier] || { mult: "1.00x", daily: dbItem.daily || 0, roi: "0.0" }
          const roi = specs.roi

          // Visual Logic (Copied from MarketView)
          let visual = null;
          if (item.type === "miner" || item.isSpecial) {
            const fanCount = dbItem.fans || 1
            const styleClass = dbItem.skinStyle ? `style-${dbItem.skinStyle}` : ""
            const tierColor = getTierColor(dbItem.tier)
            visual = (
              <div
                className={`w-[180px] h-[80px] rounded-md border border-[#333] flex items-center justify-around px-[5px] shadow-lg transition-all bg-gradient-to-b from-[#2a2d3a] to-[#151621] ${styleClass}`}
                style={{ borderBottom: dbItem.tier !== "basic" ? `2px solid ${tierColor}` : "" }}
              >
                {[...Array(fanCount)].map((_, i) => (
                  <div
                    key={i}
                    className="w-[35px] h-[35px] rounded-full bg-[#0b0c15] border border-[#444] relative flex items-center justify-center"
                  >
                    <div
                      className={`w-full h-full rounded-full fan-blades-gradient opacity-80 ${isInstalled && !isBroken ? 'animate-spin-slow' : ''}`}
                    ></div>
                  </div>
                ))}
              </div>
            )
          } else if (item.type === "shelf") {
            visual = (
              <div className="w-[100px] h-[90px] bg-[#1a1c29] border border-[#444] rounded flex flex-col justify-between p-[5px]">
                <div className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm bg-neon-green"></div>
                <div
                  className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm"
                  style={{ background: (dbItem.slots || 0) >= 4 ? "#00e676" : "#333" }}
                ></div>
                <div
                  className="h-[6px] bg-[#0b0c15] mb-[2px] rounded-sm"
                  style={{ background: (dbItem.slots || 0) >= 6 ? "#00e676" : "#333" }}
                ></div>
              </div>
            )
          }

          return (
            <div
              key={item.uid}
              onClick={() => {
                if (selectionMode) {
                  if (item.isGroup) {
                    // Select all in group
                    const allSelected = item.groupItems.every(i => selectedItems.includes(i.uid));
                    if (allSelected) {
                      setSelectedItems(prev => prev.filter(id => !item.groupItems.map(g => g.uid).includes(id)));
                    } else {
                      setSelectedItems(prev => [...prev, ...item.groupItems.map(g => g.uid).filter(id => !prev.includes(id))]);
                    }
                  } else {
                    toggleSelection(item.uid);
                  }
                }
              }}
              className={`
                        bg-card-bg border rounded-xl overflow-hidden relative group transition-all
                        ${isSelected ? 'border-neon-blue ring-1 ring-neon-blue' : isBroken ? 'border-neon-red/50 opacity-80 hover:opacity-100 hover:border-neon-red' : 'border-border-color hover:border-[#555]'}
                        ${selectionMode ? 'cursor-pointer' : ''}
                    `}
            >
              {/* Selection Checkbox */}
              {selectionMode && (
                <div className={`absolute top-2 right-2 z-20 w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-neon-blue border-neon-blue' : 'bg-black/50 border-[#555]'}`}>
                  {isSelected && <i className="fa-solid fa-check text-white text-xs"></i>}
                </div>
              )}



              {/* Rarity Glow */}
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none bg-${getTierColor(dbItem.tier).replace('text-', '')}`}></div>

              {/* Header */}
              <div className="p-3 bg-[#111] border-b border-[#222] flex justify-between items-center">
                <span className={`text-[10px] font-bold uppercase ${isInstalled ? 'text-neon-green' : 'text-[#666]'}`}>
                  {isInstalled ? <><i className="fa-solid fa-plug mr-1"></i> Em Uso</> : 'Guardado'}
                </span>
                <RarityBadge tier={dbItem.tier} small />
              </div>

              {/* Image Area */}
              <div className="h-[120px] bg-[#151621] flex items-center justify-center p-4 relative overflow-hidden">
                {visual}

                {/* Stack Badge (Moved here) */}
                {item.isGroup && (
                  <div className="absolute top-2 left-2 z-20 bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg border border-white/10">
                    x{item.count}
                  </div>
                )}

                {/* Health Bar for Miners */}
                {item.type === 'miner' && !item.isGroup && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black">
                    {/* Old Health Bar for Miners (removed) */}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <h4 className="text-sm font-bold text-white truncate mb-3">{dbItem.name}</h4>

                {/* Detailed Stats */}
                <div className="space-y-2 mb-4">
                  {item.type === 'miner' ? (
                    <>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[#888]">Poder</span>
                        <span className="font-bold text-white font-mono">{dbItem.power} MH/s</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[#888]">Produção</span>
                        <span className="font-bold text-dpix-color font-mono">{specs.daily.toFixed(2)} Ð/dia</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[#888]">ROI (Box)</span>
                        <span className="font-bold text-neon-green font-mono">{roi} Dias</span>
                      </div>

                      {/* Health / Temp Display */}
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-[#888]">Temp. / Saúde</span>
                          <span className={`font-bold font-mono ${health >= 50 ? 'text-neon-green' :
                            health >= 20 ? 'text-yellow-400' :
                              health > 0 ? 'text-neon-red' : 'text-gray-500'
                            }`}>
                            {health <= 0 ? 'SUPERAQUECIDA / PARADA' : `${health.toFixed(0)}% | ~${daysRemaining} dias`}
                          </span>
                        </div>
                        {/* Health Bar */}
                        <div className="h-1.5 w-full bg-[#111] rounded-full overflow-hidden border border-[#333]">
                          <div
                            className={`h-full transition-all duration-500 ${health >= 50 ? 'bg-neon-green' :
                              health >= 20 ? 'bg-yellow-400' :
                                health > 0 ? 'bg-neon-red' : 'bg-transparent'
                              }`}
                            style={{ width: `${health}%` }}
                          ></div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#888]">Capacidade</span>
                      <span className="font-bold text-white font-mono">{dbItem.slots} Slots</span>
                    </div>
                  )}
                </div>

                {/* Actions (Only if not selection mode) */}
                {!selectionMode && (
                  <div className="grid grid-cols-2 gap-2">
                    {isInstalled ? (
                      <button onClick={() => onUninstall(item.uid)} className="col-span-2 py-2 rounded bg-[#222] text-[#888] text-[10px] font-bold hover:bg-neon-red/20 hover:text-neon-red transition-colors border border-[#333]">
                        REMOVER
                      </button>
                    ) : (
                      <>
                        {/* Install Button */}
                        <button
                          disabled={isBroken}
                          onClick={() => {
                            if (item.isGroup) {
                              // Install one from group
                              const toInstall = item.groupItems[0];
                              setActiveView("rigs");
                              notify("Selecione um slot vazio.", "info");
                            } else {
                              if (isBroken) { notify("Repare antes!", "error"); return; }
                              setActiveView("rigs");
                              notify("Selecione um slot vazio.", "info");
                            }
                          }}
                          className={`py-2 rounded text-[10px] font-bold transition-colors border ${isBroken
                            ? 'bg-[#1a1a1a] text-[#444] border-[#333] cursor-not-allowed'
                            : 'bg-neon-blue/10 text-neon-blue border-neon-blue/30 hover:bg-neon-blue hover:text-white'
                            }`}
                        >
                          {isBroken ? 'QUEBRADA' : 'INSTALAR'}
                        </button>

                        {/* Action Button (Recycle or Repair) */}
                        {isBroken ? (
                          item.isGroup ? (
                            <button
                              onClick={() => {
                                onRequestRepair(item.groupItems.map(g => g.uid));
                              }}
                              className="py-2 rounded bg-neon-blue/10 text-neon-blue border border-neon-blue/30 text-[10px] font-bold hover:bg-neon-blue hover:text-white transition-colors flex items-center justify-center gap-1"
                              title={`Reparar todas por ${item.groupItems.length * 50} DPIX`}
                            >
                              <i className="fa-solid fa-wrench"></i> TODAS ({item.groupItems.length * 50})
                            </button>
                          ) : (
                            <button
                              onClick={() => onRequestRepair([item.uid])}
                              className="py-2 rounded bg-neon-blue/10 text-neon-blue border border-neon-blue/30 text-[10px] font-bold hover:bg-neon-blue hover:text-white transition-colors flex items-center justify-center gap-1"
                              title="Reparar por 50 DPIX"
                            >
                              <i className="fa-solid fa-wrench"></i> 50
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => {
                              if (item.isGroup) {
                                // Recycle one from group
                                onRequestRecycle([item.groupItems[0].uid]);
                              } else {
                                onRequestRecycle([item.uid]);
                              }
                            }}
                            className="py-2 rounded bg-[#222] text-[#888] border border-[#333] text-[10px] font-bold hover:bg-neon-orange/20 hover:text-neon-orange transition-colors"
                          >
                            <i className="fa-solid fa-recycle"></i>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bulk Action Bar */}
      {
        selectionMode && selectedItems.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#151621] border border-accent/50 shadow-[0_0_30px_rgba(0,0,0,0.8)] rounded-full px-6 py-3 flex items-center gap-6 z-50 animate-slide-up">
            <span className="text-white font-bold text-sm">{selectedItems.length} selecionados</span>
            <div className="h-6 w-px bg-[#333]"></div>
            <button onClick={handleBulkRecycle} className="flex items-center gap-2 text-neon-orange hover:text-white transition-colors text-xs font-bold uppercase">
              <i className="fa-solid fa-recycle"></i> Reciclar
            </button>
            {selectedItems.some(uid => inventory.find(i => i.uid === uid)?.type === 'miner') && (
              <button onClick={handleBulkRepair} className="flex items-center gap-2 text-neon-blue hover:text-white transition-colors text-xs font-bold uppercase">
                <i className="fa-solid fa-wrench"></i> Reparar
              </button>
            )}
          </div>
        )
      }
    </div>
  )
}
