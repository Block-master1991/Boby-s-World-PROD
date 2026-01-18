
export const ENEMY_SPEED = 1.0; // Units per second (Reduced for realistic patrol)
export const ENEMY_GALLOP_SPEED_MULTIPLIER = 2; // Increased to maintain 4.5 chase speed
export const ENEMY_ATTACK_DISTANCE = 1.5;
export const ENEMY_DEATH_TRIGGER_DISTANCE = 0.5;
export const ENEMY_DEATH_DURATION = 1.5;
export const ENEMY_SINKING_DELAY = 1.0; // Reduced to 1 second delay before sinking starts
export const ENEMY_PROTECTION_RADIUS = 8;
export const ENEMY_CHASE_RADIUS = 16;
export const CROSSFADE_DURATION = 0.2;
export const VISIBLE_ENEMY_DISTANCE = 220; // Expanded to 220 to match coin visibility using existing chunks
export const ENEMIES_PER_COIN_CHUNK = 1;

export const ENEMY_ANIMATION_NAMES = {
  CARNIVORE: {
    IDLE: ['Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'],
    WALK: 'Walk',
    GALLOP: 'Gallop',
    ATTACK: 'Attack',
    DEATH: 'Death',
  },
  HERBIVORE: {
    IDLE: ['Idle', 'Idle_2', 'Idle_HeadLow', 'Eating'],
    WALK: 'Walk',
    GALLOP: 'Gallop',
    ATTACK: 'Attack_Kick',
    DEATH: 'Death',
  },
};
