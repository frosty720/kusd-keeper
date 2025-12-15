import { ContractService } from '../services/ContractService';
import { KeeperConfig, LiquidationOpportunity, TransactionResult } from '../types';
import logger, { logLiquidation } from '../utils/logger';
import { formatBigNumber, radToNumber } from '../utils/calculations';

/**
 * Executes liquidations by calling Dog.bark()
 */
export class LiquidationExecutor {
  private liquidationsTriggered: number = 0;

  constructor(
    private contractService: ContractService,
    private config: KeeperConfig
  ) {}

  /**
   * Execute liquidation for an unsafe vault
   */
  async executeLiquidation(opportunity: LiquidationOpportunity): Promise<TransactionResult> {
    const { urn, ilk } = opportunity;

    logger.info('Executing liquidation', {
      ilk: ilk.name,
      urn: urn.address,
      collateral: formatBigNumber(urn.ink),
      debt: formatBigNumber(urn.art),
      ratio: opportunity.collateralizationRatio.toFixed(2) + '%',
    });

    // Check if emergency stop is enabled
    if (this.config.emergencyStop) {
      logger.warn('Emergency stop enabled, skipping liquidation');
      return {
        success: false,
        error: 'Emergency stop enabled',
      };
    }

    // Get Dog data to check if there's room for liquidation
    const dogData = await this.contractService.getDogData(ilk.name);

    // Check global debt ceiling
    if (dogData.dirt >= dogData.hole) {
      logger.warn('Global liquidation debt ceiling reached', {
        hole: radToNumber(dogData.hole),
        dirt: radToNumber(dogData.dirt),
      });
      return {
        success: false,
        error: 'Global debt ceiling reached',
      };
    }

    // Check ilk-specific debt ceiling
    if (dogData.ilkDirt >= dogData.ilkHole) {
      logger.warn('Ilk liquidation debt ceiling reached', {
        ilk: ilk.name,
        hole: radToNumber(dogData.ilkHole),
        dirt: radToNumber(dogData.ilkDirt),
      });
      return {
        success: false,
        error: 'Ilk debt ceiling reached',
      };
    }

    // Execute bark
    const result = await this.contractService.bark(ilk.name, urn.address);

    if (result.success) {
      this.liquidationsTriggered++;

      logLiquidation({
        ilk: ilk.name,
        urn: urn.address,
        collateral: formatBigNumber(urn.ink),
        debt: formatBigNumber(urn.art),
        txHash: result.txHash,
        success: true,
      });

      logger.info('Liquidation successful', {
        ilk: ilk.name,
        urn: urn.address,
        txHash: result.txHash,
        totalLiquidations: this.liquidationsTriggered,
      });
    } else {
      logLiquidation({
        ilk: ilk.name,
        urn: urn.address,
        collateral: formatBigNumber(urn.ink),
        debt: formatBigNumber(urn.art),
        success: false,
      });

      logger.error('Liquidation failed', {
        ilk: ilk.name,
        urn: urn.address,
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Execute multiple liquidations
   */
  async executeLiquidations(opportunities: LiquidationOpportunity[]): Promise<TransactionResult[]> {
    const results: TransactionResult[] = [];

    for (const opportunity of opportunities) {
      try {
        const result = await this.executeLiquidation(opportunity);
        results.push(result);

        // Add delay between liquidations to avoid nonce issues
        await this.delay(2000);
      } catch (error: any) {
        logger.error('Error executing liquidation', {
          urn: opportunity.urn.address,
          error: error.message,
        });

        results.push({
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get total liquidations triggered
   */
  getTotalLiquidations(): number {
    return this.liquidationsTriggered;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

