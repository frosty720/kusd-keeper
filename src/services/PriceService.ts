import { Contract, JsonRpcProvider, formatUnits } from 'ethers';
import { KeeperConfig, CollateralType } from '../types';
import logger from '../utils/logger';

// Import Oracle ABI
import OracleABI from '../../abis/KUSDOracle.json';

/**
 * Service for fetching market prices from oracles
 */
export class PriceService {
  private oracles: Map<CollateralType, Contract>;
  private priceCache: Map<CollateralType, { price: bigint; timestamp: number }>;
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(
    private provider: JsonRpcProvider,
    _config: KeeperConfig
  ) {
    this.oracles = new Map();
    this.priceCache = new Map();
    this.initializeOracles();
  }

  /**
   * Initialize oracle contracts
   */
  private initializeOracles(): void {
    // Oracle addresses from deployment
    const oracleAddresses: Record<CollateralType, string> = {
      'WBTC-A': '0x85a8386367755965C95E31B06778B2c89082E316',
      'WETH-A': '0x935216C74e1838E7090f31756ce0f64a34A5aAce',
      'USDT-A': '0xf8Be6Ed01e7AE968118cf3db72E7641C59A9Dc4f',
      'USDC-A': '0x930e5F6D686A19794bc7a1615a40032182D359D7',
      'DAI-A': '0x301F4fbd60156568d87932c42b3C17Bd5F0f33BD',
    };

    for (const [collateralType, address] of Object.entries(oracleAddresses)) {
      const oracle = new Contract(address, OracleABI.abi, this.provider);
      this.oracles.set(collateralType as CollateralType, oracle);
    }

    logger.info('PriceService initialized', {
      oracles: Object.keys(oracleAddresses).length,
    });
  }

  /**
   * Get current market price for a collateral type
   * @param collateralType - The collateral type (e.g., 'WBTC-A')
   * @returns Price in RAY format (27 decimals)
   */
  async getPrice(collateralType: CollateralType): Promise<bigint> {
    // Check cache first
    const cached = this.priceCache.get(collateralType);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.price;
    }

    try {
      const oracle = this.oracles.get(collateralType);
      if (!oracle) {
        throw new Error(`No oracle found for ${collateralType}`);
      }

      // Call peek() to get price and validity
      const [price, valid] = await oracle.peek();

      if (!valid) {
        throw new Error(`Oracle price for ${collateralType} is not valid`);
      }

      // Price from oracle is in WAD (18 decimals), convert to RAY (27 decimals)
      const priceInRay = price * (10n ** 9n);

      // Update cache
      this.priceCache.set(collateralType, {
        price: priceInRay,
        timestamp: Date.now(),
      });

      logger.debug('Price fetched', {
        collateralType,
        price: formatUnits(price, 18),
      });

      return priceInRay;
    } catch (error: any) {
      logger.error('Failed to fetch price', {
        collateralType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get prices for all collateral types
   */
  async getAllPrices(): Promise<Map<CollateralType, bigint>> {
    const prices = new Map<CollateralType, bigint>();

    const collateralTypes: CollateralType[] = ['WBTC-A', 'WETH-A', 'USDT-A', 'USDC-A', 'DAI-A'];

    await Promise.all(
      collateralTypes.map(async (type) => {
        try {
          const price = await this.getPrice(type);
          prices.set(type, price);
        } catch (error: any) {
          logger.error(`Failed to get price for ${type}`, { error: error.message });
        }
      })
    );

    return prices;
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.priceCache.clear();
    logger.debug('Price cache cleared');
  }

  /**
   * Get collateral type from ilk bytes32
   */
  private ilkToCollateralType(ilk: string): CollateralType | null {
    const ilkMap: Record<string, CollateralType> = {
      '0x574254432d410000000000000000000000000000000000000000000000000000': 'WBTC-A',
      '0x574554482d410000000000000000000000000000000000000000000000000000': 'WETH-A',
      '0x555344542d410000000000000000000000000000000000000000000000000000': 'USDT-A',
      '0x555344432d410000000000000000000000000000000000000000000000000000': 'USDC-A',
      '0x4441492d41000000000000000000000000000000000000000000000000000000': 'DAI-A',
    };

    return ilkMap[ilk] || null;
  }

  /**
   * Get price for an ilk
   */
  async getPriceForIlk(ilk: string): Promise<bigint> {
    const collateralType = this.ilkToCollateralType(ilk);
    if (!collateralType) {
      throw new Error(`Unknown ilk: ${ilk}`);
    }
    return this.getPrice(collateralType);
  }
}

