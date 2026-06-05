"use client";

import { Gamepad2 } from "lucide-react";
import React, { useMemo } from "react";

interface JoystickProps {
  baseScreenPosition: { x: number; y: number };
  knobScreenOffset: { x: number; y: number };
  size?: number;
  knobSize?: number;
}

// --- Hooks ---

const useJoystickStyles = (
  baseScreenPosition: { x: number; y: number },
  knobScreenOffset: { x: number; y: number },
  size: number,
  knobSize: number
) => {
  return useMemo(() => {
    const base: React.CSSProperties = {
      width: size,
      height: size,
      left: `${baseScreenPosition.x - size / 2}px`,
      top: `${baseScreenPosition.y - size / 2}px`,
      position: "fixed" as const,
    };

    const knob: React.CSSProperties = {
      width: knobSize,
      height: knobSize,
      transform: `translate(${knobScreenOffset.x}px, ${knobScreenOffset.y}px)`,
      position: "absolute" as const,
      left: "50%",
      top: "50%",
      marginLeft: `-${knobSize / 2}px`,
      marginTop: `-${knobSize / 2}px`,
      transition: "none",
      cursor: "grab",
    };

    return { base, knob };
  }, [baseScreenPosition, knobScreenOffset, size, knobSize]);
};

// --- Sub-components ---

const JoystickKnob = ({ style }: { style: React.CSSProperties }) => (
  <div
    className="bg-primary rounded-full shadow-inner flex items-center justify-center"
    style={style}
  >
    <Gamepad2 className="h-6 w-6 text-primary-foreground" />
  </div>
);

const JoystickBase = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style: React.CSSProperties;
}) => (
  <div
    className="z-50 select-none touch-none"
    style={style}
    aria-label="Virtual joystick for movement"
  >
    <div className="w-full h-full bg-card/70 backdrop-blur-sm rounded-full shadow-xl border border-border flex items-center justify-center relative">
      {children}
    </div>
  </div>
);

// --- Main Component ---

const Joystick: React.FC<JoystickProps> = ({
  baseScreenPosition,
  knobScreenOffset,
  size = 96,
  knobSize = 48,
}) => {
  const styles = useJoystickStyles(baseScreenPosition, knobScreenOffset, size, knobSize);

  return (
    <JoystickBase style={styles.base}>
      <JoystickKnob style={styles.knob} />
    </JoystickBase>
  );
};

export default Joystick;
