import { ContractService } from '../services/ContractService';
import { KeeperConfig, LiquidationOpportunity } from '../types';
import logger, { logVaultCheck } from '../utils/logger';
import { isVaultSafe, calculateCollateralizationRatio, rayToNumber } from '../utils/calculations';
import { getCollateralTypes, collateralTypeToIlk } from '../config/config';
import { EventLog } from 'ethers';

/**
 * Monitors vaults for liquidation opportunities
 */
export class VaultMonitor {
  private urns: Map<string, Set<string>>; // ilk -> Set of urn addresses

  constructor(
    private contractService: ContractService,
    private config: KeeperConfig
  ) {
    this.urns = new Map();
  }

  /**
   * Start monitoring vaults
   */
  async start(): Promise<void> {
    logger.info('Starting VaultMonitor');

    // Load historical urns
    await this.loadHistoricalUrns();

    // Subscribe to new frob events
    this.subscribeToFrobEvents();

    logger.info('VaultMonitor started', {
      totalUrns: this.getTotalUrnCount(),
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    logger.info('VaultMonitor stopped');
  }

  /**
   * Load historical urns from past events
   */
  private async loadHistoricalUrns(): Promise<void> {
    logger.info('Loading historical urns...');

    const currentBlock = await this.contractService.getCurrentBlock();
    const fromBlock = Math.max(0, currentBlock - 100000); // Last ~100k blocks

    try {
      const events = await this.contractService.getPastFrobEvents(fromBlock, currentBlock);

      for (const event of events) {
        if ('args' in event) {
          const eventLog = event as EventLog;
          const ilk = eventLog.args?.ilk;
          const urn = eventLog.args?.u;

          if (ilk && urn) {
            this.addUrn(ilk, urn);
          }
        }
      }

      logger.info('Historical urns loaded', {
        totalUrns: this.getTotalUrnCount(),
        fromBlock,
        toBlock: currentBlock,
      });
    } catch (error: any) {
      logger.error('Failed to load historical urns', { error: error.message });
    }
  }

  /**
   * Subscribe to new frob events
   */
  private subscribeToFrobEvents(): void {
    this.contractService.onVatFrob((ilk: string, urn: string, event: any) => {
      this.addUrn(ilk, urn);
      logger.debug('New frob event', { ilk, urn, block: event.blockNumber });
    });
  }

  /**
   * Add urn to monitoring list
   */
  private addUrn(ilk: string, urnAddress: string): void {
    if (!this.urns.has(ilk)) {
      this.urns.set(ilk, new Set());
    }
    this.urns.get(ilk)!.add(urnAddress);
  }

  /**
   * Get total number of urns being monitored
   */
  private getTotalUrnCount(): number {
    let count = 0;
    for (const urnSet of this.urns.values()) {
      count += urnSet.size;
    }
    return count;
  }

  /**
   * Check all vaults for liquidation opportunities
   */
  async checkVaults(): Promise<LiquidationOpportunity[]> {
    const startTime = Date.now();
    const opportunities: LiquidationOpportunity[] = [];

    const collateralTypes = getCollateralTypes(this.config);

    for (const collateralType of collateralTypes) {
      const ilk = collateralTypeToIlk(collateralType);
      const urnAddresses = this.urns.get(ilk) || new Set();

      if (urnAddresses.size === 0) {
        continue;
      }

      // Get ilk data once
      const ilkData = await this.contractService.getIlk(ilk);
      const dogData = await this.contractService.getDogData(ilk);

      // Check each urn
      for (const urnAddress of urnAddresses) {
        try {
          const urn = await this.contractService.getUrn(ilk, urnAddress);

          // Skip empty vaults
          if (urn.art === 0n) {
            continue;
          }

          // Check if vault is safe
          const safe = isVaultSafe(urn.ink, urn.art, ilkData.spot, ilkData.rate);

          if (!safe) {
            // Calculate collateralization ratio
            const ratio = calculateCollateralizationRatio(
              urn.ink,
              urn.art,
              ilkData.spot,
              ilkData.rate
            );

            // Get liquidation ratio from chop (e.g., 1.13 = 113% = 130% liquidation ratio)
            const liquidationRatio = rayToNumber(dogData.chop) * 100;

            opportunities.push({
              urn,
              ilk: ilkData,
              collateralValue: urn.ink * ilkData.spot,
              debtValue: urn.art * ilkData.rate,
              collateralizationRatio: ratio,
              liquidationRatio,
              canLiquidate: true,
            });

            logger.warn('Unsafe vault detected', {
              ilk: collateralType,
              urn: urnAddress,
              ratio: ratio.toFixed(2) + '%',
              liquidationRatio: liquidationRatio.toFixed(2) + '%',
            });
          }
        } catch (error: any) {
          logger.error('Error checking urn', {
            ilk: collateralType,
            urn: urnAddress,
            error: error.message,
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    logVaultCheck({
      totalVaults: this.getTotalUrnCount(),
      unsafeVaults: opportunities.length,
      duration,
    });

    return opportunities;
  }
}

