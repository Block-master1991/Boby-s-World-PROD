import { useToast } from '@/hooks/use-toast';
import { getStoreItemsActiveWithIcons, type StoreItemDefinition } from '@/lib/items';
import { useApiFetch } from '@/utils/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface OpUpdate { id: string; type: 'useItem'|'consumeBottle'; amount?: number; itemId?: string | undefined; timestamp: number; status: 'pending'|'failed'; }
interface InvProps { isAuthenticated: boolean; isWalletConnectedAndMatching: boolean; authUserPublicKey: string|undefined; fetchPlayerData: () => Promise<void>; protectionBottleCount: number; guardianShieldCount: number; speedyPawsTreatCount: number; coinMagnetTreatCount: number; activateSpeedBoost: (amt: number) => (() => void); activateGuardianShield: (amt: number) => (() => void); activateCoinMagnet: (amt: number) => (() => void); }

const useStore = () => {
    const [d, sD] = useState<StoreItemDefinition[]>([]);
    useEffect(() => {
        let t: NodeJS.Timeout; let c = 0;
        const l = async () => { try { const i = await getStoreItemsActiveWithIcons(); if(i?.length){sD(i);return true;} throw new Error(); } catch { try{const {fallbackStoreItems:f}=await import('@/lib/items'); sD(f.map(x=>({...x, icon:undefined} as unknown as StoreItemDefinition)));return true;}catch{sD([]);return false;} } };
        l().then(k=>{if(!k) t=setInterval(()=>{if(c++<3)l();else clearInterval(t);},2000);}); return ()=>{if(t)clearInterval(t);};
    }, []); return d;
};
// Helper to avoid Any
type Activator = (amt: number) => (() => void);

export const useGameInventory = (p: InvProps) => {
    const { toast } = useToast(); const { apiFetch } = useApiFetch(); const items = useStore();
    const [ops, sOps] = useState<OpUpdate[]>([]);
    const q = useRef<Array<{ id: string }>>([]); const proc = useRef(false);

    const getP = useCallback((t: 'useItem'|'consumeBottle', id?: string) => ops.reduce((c, u) => (u.status==='pending' && u.type===t && (!id || u.itemId===id)) ? c+(u.amount||1) : c, 0), [ops]);
    const addOp = useCallback((t: 'useItem'|'consumeBottle', amt: number, iId?: string) => { const id=Date.now().toString(); sOps(prev=>[...prev,{id,type:t,amount:amt,itemId:iId,timestamp:Date.now(),status:'pending'}]); return id; }, []);
    
    const counts = useMemo(() => ({ b: p.protectionBottleCount-getP('consumeBottle'), s: p.guardianShieldCount-getP('useItem','2'), sp: p.speedyPawsTreatCount-getP('useItem','3'), m: p.coinMagnetTreatCount-getP('useItem','4') }), [p, getP]);

    const useItem = useCallback(async (id: string, amt: number) => {
        if (!p.isAuthenticated || !p.authUserPublicKey) { toast({ title: 'Auth Error' }); return; }
        const def = items.find(i=>i.id===id); if(!def) return;
        let c=0; let act: Activator|undefined;
        if(id==='3'){c=counts.sp; act=p.activateSpeedBoost;} else if(id==='2'){c=counts.s; act=p.activateGuardianShield;} else if(id==='4'){c=counts.m; act=p.activateCoinMagnet;}
        if(c < amt) { toast({ title: 'Not enough items' }); return; }
        
        const rb = act?.(amt); const uid = addOp('useItem', amt, id);
        try { 
            const r = await apiFetch('/api/game/useItem', { method: 'POST', body: JSON.stringify({ itemId: id, amount: amt }) });
            if(r.ok){ await p.fetchPlayerData(); sOps(prev=>prev.filter(u=>u.id!==uid)); } else throw new Error(); 
        } 
        catch { sOps(prev=>prev.map(u=>u.id===uid?{...u,status:'failed'}:u)); rb?.(); }
    }, [p, items, counts, addOp, apiFetch, toast]);

    const runQ = useCallback(async () => {
        proc.current=true;
        while(q.current.length){
            const [curr] = q.current;
            if (!curr) break; 
            try{ 
                // eslint-disable-next-line no-await-in-loop
                const r=await apiFetch('/api/game/consumeProtectionBottle', {method:'POST'}); 
                if(r.ok){ 
                    // eslint-disable-next-line no-await-in-loop
                    await p.fetchPlayerData(); sOps(prev=>prev.filter(u=>u.id!==curr.id)); 
                } else throw new Error(); 
            }
            catch{ sOps(prev=>prev.map(u=>u.id===curr.id?{...u,status:'failed'}:u)); } finally{ q.current.shift(); }
        } proc.current=false;
    }, [apiFetch, p]);

    const consumeB = useCallback(() => {
        if(counts.b <= 0) return; const id = addOp('consumeBottle', 1); q.current.push({id});
        if(!proc.current) runQ();
    }, [counts.b, addOp, runQ]);

    const [speedyPawsTreatDef, guardianShieldDef, protectionBottleDef, coinMagnetTreatDef] = ['3','2','1','4'].map(id => items.find(i => i.id === id)||undefined);
    return { speedyPawsTreatDef, guardianShieldDef, protectionBottleDef, coinMagnetTreatDef, displayedProtectionBottleCount: counts.b, displayedGuardianShieldCount: counts.s, displayedSpeedyPawsTreatCount: counts.sp, displayedCoinMagnetTreatCount: counts.m, handleUseConsumableItem: useItem, handleConsumeProtectionBottle: consumeB };
};
