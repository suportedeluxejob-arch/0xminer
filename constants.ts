import { DBItem } from './types';

export const DPIX_PRICE_BRL = 1.0;
export const MIN_WITHDRAW_POOL = 10.0;
export const RENT_DURATION_MS = 12 * 60 * 60 * 1000;
export const EXCHANGE_FEE = 0.05;

export const ITEMS_DB: { [key: string]: DBItem[] } = {
    miner: [
        { id: 'node_basic', type: 'miner', name: 'Starter Node', tier: 'basic', daily: 6.25, power: 20, price: 160, fans: 1 },
        { id: 'gpu_common', type: 'miner', name: 'GTX Miner', tier: 'common', daily: 7.81, power: 25, price: 350, fans: 2 },
        { id: 'gpu_rare', type: 'miner', name: 'RTX Speed', tier: 'rare', daily: 10.31, power: 33, price: 0, fans: 2, hidden: true },
        { id: 'gpu_epic', type: 'miner', name: 'RTX Turbo', tier: 'epic', daily: 13.43, power: 43, price: 0, fans: 3, hidden: true },
        { id: 'asic_legendary', type: 'miner', name: 'Quantum ASIC', tier: 'legendary', daily: 18.75, power: 60, price: 0, fans: 4, hidden: true },
        {
            id: 'miner_magma', type: 'miner', name: 'Magma Rig', tier: 'rare',
            daily: 10.31, power: 36, price: 450, fans: 2,
            skinStyle: 'magma', isSpecial: true, desc: 'Núcleo superaquecido. Alta performance térmica.'
        },
        {
            id: 'miner_diamond', type: 'miner', name: 'Diamond ASIC', tier: 'epic',
            daily: 13.43, power: 48, price: 1200, fans: 3,
            skinStyle: 'diamond', isSpecial: true, desc: 'Circuitos de cristal puro. Eficiência extrema.'
        },
        {
            id: 'miner_gold', type: 'miner', name: 'Golden Sovereign', tier: 'legendary',
            daily: 18.75, power: 85, price: 5000, fans: 4,
            skinStyle: 'gold', isSpecial: true, desc: 'O ápice da mineração. Banhado a ouro 24k.'
        },
        { id: 'box_miner', type: 'box', subtype: 'miner', name: 'Miner Box', tier: 'box', price: 100, desc: 'Sorteie uma Mineradora' } as any
    ],
    shelf: [
        { id: 'shelf_basic', type: 'shelf', name: 'Rack Básico', tier: 'basic', slots: 1, price: 35, desc: 'Cabe 1 mineradora' },
        { id: 'shelf_common', type: 'shelf', name: 'Rack Padrão', tier: 'common', slots: 2, price: 90, desc: 'Cabe 2 mineradoras' },
        { id: 'shelf_rare', type: 'shelf', name: 'Rack Reforçado', tier: 'rare', slots: 3, price: 0, desc: 'Cabe 3 mineradoras', hidden: true },
        { id: 'shelf_epic', type: 'shelf', name: 'Rack Server', tier: 'epic', slots: 4, price: 0, desc: 'Cabe 4 mineradoras', hidden: true },
        { id: 'shelf_legendary', type: 'shelf', name: 'Rack Industrial', tier: 'legendary', slots: 6, price: 0, desc: 'Cabe 6 mineradoras', hidden: true },
        { id: 'box_shelf', type: 'box', subtype: 'shelf', name: 'Shelf Box', tier: 'box', price: 20, desc: 'Sorteie uma Prateleira' } as any
    ],
    room: [
        { id: 'room_basic', type: 'room', name: 'Quarto Pequeno', tier: 'basic', slots: 1, price: 70, rent: 0.60, desc: 'Espaço para 1 Rack' },
        { id: 'room_common', type: 'room', name: 'Garagem', tier: 'common', slots: 2, price: 180, rent: 1.50, desc: 'Espaço para 2 Racks' },
        { id: 'room_rare', type: 'room', name: 'Sala de Servidor', tier: 'rare', slots: 3, price: 0, rent: 4.00, desc: 'Espaço para 3 Racks', hidden: true },
        { id: 'room_epic', type: 'room', name: 'Galpão Tech', tier: 'epic', slots: 5, price: 0, rent: 10.00, desc: 'Espaço para 5 Racks', hidden: true },
        { id: 'room_legendary', type: 'room', name: 'Datacenter', tier: 'legendary', slots: 8, price: 0, rent: 25.00, desc: 'Espaço para 8 Racks', hidden: true },
        { id: 'box_room', type: 'box', subtype: 'room', name: 'Room Box', tier: 'box', price: 40, desc: 'Sorteie um Quarto' } as any
    ]
};
