import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const checkIsMobile = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      const isIPadPro =
        /Macintosh/i.test(navigator.userAgent) &&
        navigator.maxTouchPoints > 1;
      const isMobileSize = window.innerWidth < MOBILE_BREAKPOINT;
      const isLandscapeMobile =
        window.innerHeight < MOBILE_BREAKPOINT &&
        window.matchMedia("(pointer: coarse)").matches;

      return isMobileUA || isIPadPro || isMobileSize || isLandscapeMobile;
    };

    const onChange = () => {
      setIsMobile(checkIsMobile());
    };

    window.addEventListener("resize", onChange);
    onChange();

    return () => {
      window.removeEventListener("resize", onChange);
    };
  }, []);

  return !!isMobile;
}
