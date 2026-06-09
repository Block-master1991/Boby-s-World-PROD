import { useToast } from "@/hooks/ui/use-toast";
import { useCallback, useEffect, useRef, useState } from "react";

const SPEED_BOOST_DURATION = 30;
const SHIELD_DURATION = 30;
const COIN_MAGNET_DURATION = 30;

// Extracted Timer Logic
const useBuffTimer = (duration: number, name: string, endMsg: string) => {
  const { toast } = useToast();
  const [state, setState] = useState({ active: false, time: 0 });
  const [shouldShowEndToast, setShouldShowEndToast] = useState(false);
  const timer = useRef<NodeJS.Timeout | null>(null);

  // Effect to show toast when buff ends
  useEffect(() => {
    if (shouldShowEndToast) {
      toast({ title: endMsg });
      setShouldShowEndToast(false);
    }
  }, [shouldShowEndToast, endMsg, toast]);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState({ active: false, time: 0 });
  }, []);

  const tick = useCallback(() => {
    setState(p => {
      if (p.time <= 1) {
        stop();
        setShouldShowEndToast(true);
        return { active: false, time: 0 };
      }
      return { ...p, time: p.time - 1 };
    });
  }, [stop]);

  const activate = useCallback(
    (amt: number) => {
      stop();
      const totalTime = duration * amt;
      setState({ active: true, time: totalTime });
      timer.current = setInterval(tick, 1000);
      toast({ title: `${name} Activated!`, description: `Active for ${totalTime}s.` });

      return () => {
        stop();
        toast({ title: `${name} Cancelled`, variant: "destructive" });
      };
    },
    [duration, name, stop, tick, toast]
  );

  useEffect(() => stop, [stop]);

  return { isActive: state.active, timeLeft: state.time, activate };
};

export const useGameEffects = () => {
  const sb = useBuffTimer(SPEED_BOOST_DURATION, "Speed Boost", "Speed Boost Wore Off.");
  const sh = useBuffTimer(SHIELD_DURATION, "Guardian Shield", "Guardian Shield Wore Off.");
  const cm = useBuffTimer(COIN_MAGNET_DURATION, "Coin Magnet", "Coin Magnet Wore Off.");

  return {
    isSpeedBoostActive: sb.isActive,
    speedBoostTimeLeft: sb.timeLeft,
    activateSpeedBoost: sb.activate,
    isShieldActive: sh.isActive,
    shieldTimeLeft: sh.timeLeft,
    activateGuardianShield: sh.activate,
    isCoinMagnetActive: cm.isActive,
    coinMagnetTimeLeft: cm.timeLeft,
    activateCoinMagnet: cm.activate,
    COIN_MAGNET_DURATION,
  };
};
