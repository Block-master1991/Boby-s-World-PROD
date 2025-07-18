
import type { ElementType } from 'react';
import { Zap, Shield, Bone, Magnet } from 'lucide-react'; // Added Magnet

export interface StoreItemDefinition {
    id: string;
    name: string;
    description: string;
    price: number; // Price is now in USD
    icon?: ElementType;
    image: string;
    dataAiHint: string;
}

export const storeItems: StoreItemDefinition[] = [
    { id: '1', name: 'Protection Bone', description: 'When enemies attack, this bone is consumed instead of your coins, protecting your wealth.', price: 0.001, image: '/Boby-logo.png', dataAiHint: 'sturdy bone', icon: Bone },
    { id: '2', name: 'Guardian Shield', description: 'Provides temporary protection in fights.', price: 0.001, image: '/guardianShield.png', dataAiHint: 'dog shield', icon: Shield },
    { id: '3', name: 'Speedy Paws', description: 'Boosts your running speed for a short time.', price: 0.001, image: '/speedyPawsTreat.png', dataAiHint: 'dog treat', icon: Zap },
    { id: '4', name: 'Coin Magnet', description: 'When active, automatically collects nearby coins for a short duration.', price: 0.001, image: '/coinMagnetTreat.png', dataAiHint: 'dog magnet', icon: Magnet },
];
