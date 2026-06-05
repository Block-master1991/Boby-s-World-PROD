import ashSmall from "./presets/ash_small.json";
import ashMedium from "./presets/ash_medium.json";
import ashLarge from "./presets/ash_large.json";
import aspenSmall from "./presets/aspen_small.json";
import aspenMedium from "./presets/aspen_medium.json";
import aspenLarge from "./presets/aspen_large.json";
import bush1 from "./presets/bush_1.json";
import bush2 from "./presets/bush_2.json";
import bush3 from "./presets/bush_3.json";
import oakSmall from "./presets/oak_small.json";
import oakMedium from "./presets/oak_medium.json";
import oakLarge from "./presets/oak_large.json";
import pineSmall from "./presets/pine_small.json";
import pineMedium from "./presets/pine_medium.json";
import pineLarge from "./presets/pine_large.json";
import TreeOptions from "../options";

export const TreePreset = {
  "Ash Small": ashSmall,
  "Ash Medium": ashMedium,
  "Ash Large": ashLarge,
  "Aspen Small": aspenSmall,
  "Aspen Medium": aspenMedium,
  "Aspen Large": aspenLarge,
  "Bush 1": bush1,
  "Bush 2": bush2,
  "Bush 3": bush3,
  "Oak Small": oakSmall,
  "Oak Medium": oakMedium,
  "Oak Large": oakLarge,
  "Pine Small": pineSmall,
  "Pine Medium": pineMedium,
  "Pine Large": pineLarge,
};

export function loadPreset(name: string): TreeOptions {
  const preset = TreePreset[name as keyof typeof TreePreset];
  if (preset) {
    const options = new TreeOptions();
    options.copy(preset as unknown as TreeOptions);
    return options;
  }
  return new TreeOptions();
}
