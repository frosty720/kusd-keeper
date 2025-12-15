// MakerDAO precision constants
export const WAD = 10n ** 18n;  // 18 decimals
export const RAY = 10n ** 27n;  // 27 decimals
export const RAD = 10n ** 45n;  // 45 decimals

/**
 * Convert WAD to human-readable number
 */
export function wadToNumber(wad: bigint): number {
  return Number(wad) / Number(WAD);
}

/**
 * Convert RAY to human-readable number
 */
export function rayToNumber(ray: bigint): number {
  return Number(ray) / Number(RAY);
}

/**
 * Convert RAD to human-readable number
 */
export function radToNumber(rad: bigint): number {
  return Number(rad) / Number(RAD);
}

/**
 * Convert number to WAD
 */
export function numberToWad(num: number): bigint {
  return BigInt(Math.floor(num * Number(WAD)));
}

/**
 * Convert number to RAY
 */
export function numberToRay(num: number): bigint {
  return BigInt(Math.floor(num * Number(RAY)));
}

/**
 * Multiply WAD by RAY, result in RAY
 */
export function wmul(x: bigint, y: bigint): bigint {
  return (x * y) / WAD;
}

/**
 * Multiply RAY by RAY, result in RAY
 */
export function rmul(x: bigint, y: bigint): bigint {
  return (x * y) / RAY;
}

/**
 * Divide WAD by WAD, result in WAD
 */
export function wdiv(x: bigint, y: bigint): bigint {
  return (x * WAD) / y;
}

/**
 * Divide RAY by RAY, result in RAY
 */
export function rdiv(x: bigint, y: bigint): bigint {
  return (x * RAY) / y;
}

/**
 * Calculate collateralization ratio
 * @param ink - Collateral amount (WAD)
 * @param art - Debt amount (WAD)
 * @param spot - Price with safety margin (RAY)
 * @param rate - Accumulated rate (RAY)
 * @returns Collateralization ratio as percentage (e.g., 150 for 150%)
 */
export function calculateCollateralizationRatio(
  ink: bigint,
  art: bigint,
  spot: bigint,
  rate: bigint
): number {
  if (art === 0n) {
    return Infinity;
  }

  // collateralValue = ink * spot (in RAY)
  const collateralValue = ink * spot;

  // debtValue = art * rate (in RAY)
  const debtValue = art * rate;

  if (debtValue === 0n) {
    return Infinity;
  }

  // ratio = (collateralValue / debtValue) * 100
  const ratio = (collateralValue * 100n) / debtValue;

  return Number(ratio);
}

/**
 * Check if vault is safe
 * @param ink - Collateral amount (WAD)
 * @param art - Debt amount (WAD)
 * @param spot - Price with safety margin (RAY)
 * @param rate - Accumulated rate (RAY)
 * @returns true if safe, false if unsafe
 */
export function isVaultSafe(
  ink: bigint,
  art: bigint,
  spot: bigint,
  rate: bigint
): boolean {
  // safe = ink * spot >= art * rate
  const collateralValue = ink * spot;
  const debtValue = art * rate;

  return collateralValue >= debtValue;
}

/**
 * Calculate auction price at current time
 * @param top - Starting price (RAY)
 * @param tic - Auction start time (seconds)
 * @param tau - Price decrease duration (seconds)
 * @param currentTime - Current time (seconds)
 * @returns Current auction price (RAY)
 */
export function calculateAuctionPrice(
  top: bigint,
  tic: number,
  tau: number,
  currentTime: number
): bigint {
  const elapsed = currentTime - tic;

  if (elapsed <= 0) {
    return top;
  }

  if (elapsed >= tau) {
    return 0n;
  }

  // Linear decrease: price = top * (1 - elapsed/tau)
  const remaining = tau - elapsed;
  return (top * BigInt(remaining)) / BigInt(tau);
}

/**
 * Calculate profit percentage
 * @param buyPrice - Price we pay (RAY)
 * @param sellPrice - Market price (RAY)
 * @returns Profit percentage (e.g., 5.5 for 5.5%)
 */
export function calculateProfitPercentage(
  buyPrice: bigint,
  sellPrice: bigint
): number {
  if (buyPrice === 0n) {
    return 0;
  }

  // profit% = ((sellPrice - buyPrice) / buyPrice) * 100
  const profit = sellPrice - buyPrice;
  const percentage = (profit * 10000n) / buyPrice;

  return Number(percentage) / 100;
}

/**
 * Format bigint for display
 */
export function formatBigNumber(value: bigint, decimals: number = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;

  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmed = remainderStr.replace(/0+$/, '');

  if (trimmed.length === 0) {
    return whole.toString();
  }

  return `${whole.toString()}.${trimmed}`;
}

