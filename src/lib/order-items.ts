/** A manually added part line, shared by Canvas, Extension, Schach and Modular. */
export interface ManualOrderItem {
  code: string;
  desc: string;
  price: number;
  qty: number;
  /** Price already has a discount baked in — never discount it again. */
  noDiscount?: boolean;
}

export function manualTotal(items: ManualOrderItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
