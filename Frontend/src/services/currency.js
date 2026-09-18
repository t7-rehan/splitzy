export const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee", flag: "🇮🇳" },
  { code: "USD", symbol: "$", label: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", symbol: "€", label: "Euro", flag: "🇪🇺" },
  { code: "GBP", symbol: "£", label: "British Pound", flag: "🇬🇧" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen", flag: "🇯🇵" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar", flag: "🇦🇺" },
];

export const USD_RATES = {
  USD: 1.0,
  INR: 83.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 155.0,
  AUD: 1.51,
};

export function symbolFor(code) {
  return CURRENCIES.find((c) => c.code === code)?.symbol || code || "₹";
}

export function convertCurrency(amount, fromCode, toCode) {
  if (!amount) return 0;
  if (fromCode === toCode) return amount;
  const fromRate = USD_RATES[fromCode] || 1;
  const toRate = USD_RATES[toCode] || 1;
  // Convert from source to USD then USD to target
  const inUSD = amount / fromRate;
  return inUSD * toRate;
}

export function fmtMoney(amount, currencyCode = "INR", showSign = false) {
  const symbol = symbolFor(currencyCode);
  const val = Math.abs(Math.round(amount));
  const formatted = val.toLocaleString(currencyCode === "INR" ? "en-IN" : "en-US");
  const sign = amount > 0.5 ? (showSign ? "+" : "") : amount < -0.5 ? "-" : "";
  return `${sign}${symbol}${formatted}`;
}
