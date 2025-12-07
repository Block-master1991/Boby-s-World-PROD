declare module "*.json" {
  const value: Record<string, unknown>;
  export default value;
}

declare module "*.frag?raw" {
  const value: string;
  export default value;
}

declare module "*.vert?raw" {
  const value: string;
  export default value;
}
