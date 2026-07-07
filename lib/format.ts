/**
 * จัดรูปแบบราคาให้จำนวนทศนิยมเหมาะกับสินทรัพย์แต่ละชนิด
 * - ทอง/เงิน (XAU, XAG): 2 ตำแหน่ง (ราคาหลักพัน ไม่ต้องละเอียดมาก)
 * - คู่เงินที่มี JPY: 3 ตำแหน่ง (ธรรมเนียมฟอเร็กซ์ทั่วไป)
 * - คู่เงินฟอเร็กซ์อื่นๆ: 5 ตำแหน่ง (ตามธรรมเนียม pip)
 */
export function formatPrice(symbol: string, price: number): string {
  const upper = symbol.toUpperCase();
  if (upper.includes("XAU") || upper.includes("XAG")) {
    return price.toFixed(2);
  }
  if (upper.includes("JPY")) {
    return price.toFixed(3);
  }
  return price.toFixed(5);
}
