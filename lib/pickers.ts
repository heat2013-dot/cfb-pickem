export const PICKERS = ["Connor", "Dad", "Adam", "David", "Jeremy"] as const;
export type Picker = (typeof PICKERS)[number];
