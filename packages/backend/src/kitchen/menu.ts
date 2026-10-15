export interface MenuItem {
  readonly name: string;
  /** In US dollars. */
  readonly price: number;
}

/** Today's menu. */
export const MENU: ReadonlyArray<MenuItem> = [
  { name: "Espresso", price: 3.25 },
  { name: "Flat white", price: 4.5 },
  { name: "Cappuccino", price: 4.75 },
  { name: "Oat latte", price: 5.25 },
  { name: "Almond croissant", price: 4.25 },
];
