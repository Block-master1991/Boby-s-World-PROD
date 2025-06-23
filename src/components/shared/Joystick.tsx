
'use client';

import React from 'react';
import { Gamepad2 } from 'lucide-react';

interface JoystickProps {
  baseScreenPosition: { x: number; y: number };
  knobScreenOffset: { x: number; y: number };
  size?: number;
  knobSize?: number;
}

const Joystick: React.FC<JoystickProps> = ({
  baseScreenPosition,
  knobScreenOffset,
  size = 96,
  knobSize = 48,
}) => {
  // Calculate position for the base to be centered at baseScreenPosition
  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    left: `${baseScreenPosition.x - size / 2}px`,
    top: `${baseScreenPosition.y - size / 2}px`,
    position: 'fixed', // Use fixed to position relative to viewport
  };

  // Knob position is relative to the center of the base, using transform
  const knobStyle: React.CSSProperties = {
    width: knobSize,
    height: knobSize,
    transform: `translate(${knobScreenOffset.x}px, ${knobScreenOffset.y}px)`,
    position: 'absolute', // Positioned relative to its direct parent (the base's inner div)
    // Centering the knob initially before transform is applied
    left: '50%',
    top: '50%',
    marginLeft: `-${knobSize / 2}px`,
    marginTop: `-${knobSize / 2}px`,
    transition: 'none', // Movement is direct via transform
    cursor: 'grab',
  };

  return (
    <div
      className="z-50 select-none touch-none"
      style={baseStyle}
      aria-label="Virtual joystick for movement"
    >
      <div
        className="w-full h-full bg-card/70 backdrop-blur-sm rounded-full shadow-xl border border-border flex items-center justify-center relative"
        // Removed touch handlers from here, GameCanvas will handle them
      >
        <div
          className="bg-primary rounded-full shadow-inner flex items-center justify-center"
          style={knobStyle}
        >
          <Gamepad2 className="h-6 w-6 text-primary-foreground" />
        </div>
      </div>
      {/* Optional: Add a small visual cue for base position if needed, or remove label
      <p className="absolute -bottom-6 text-xs text-muted-foreground whitespace-nowrap left-1/2 -translate-x-1/2">Move</p>
      */}
    </div>
  );
};

export default Joystick;
