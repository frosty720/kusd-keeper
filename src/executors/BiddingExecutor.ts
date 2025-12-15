import { ContractService } from '../services/ContractService';
import { KeeperConfig, BiddingOpportunity, TransactionResult } from '../types';
import logger, { logAuctionBid } from '../utils/logger';
import { formatBigNumber, WAD } from '../utils/calculations';

/**
 * Executes bids on Clipper auctions
 */
export class BiddingExecutor {
  private bidsExecuted: number = 0;
  private totalProfit: bigint = 0n;

  constructor(
    private contractService: ContractService,
    private config: KeeperConfig
  ) {}

  /**
   * Execute bid on an auction
   */
  async executeBid(opportunity: BiddingOpportunity): Promise<TransactionResult> {
    const { auction, currentPrice, marketPrice, profitPercentage } = opportunity;

    logger.info('Executing bid', {
      ilk: auction.ilk,
      auctionId: auction.id,
      currentPrice: formatBigNumber(currentPrice, 27),
      marketPrice: formatBigNumber(marketPrice, 27),
      profit: profitPercentage.toFixed(2) + '%',
    });

    // Check if emergency stop is enabled
    if (this.config.emergencyStop) {
      logger.warn('Emergency stop enabled, skipping bid');
      return {
        success: false,
        error: 'Emergency stop enabled',
      };
    }

    // Check KUSD balance in Vat
    const kusdBalance = await this.contractService.getKusdBalance();

    // Calculate KUSD needed for this bid
    const kusdNeeded = (auction.lot * currentPrice) / WAD;

    if (kusdBalance < kusdNeeded) {
      logger.warn('Insufficient KUSD balance in Vat', {
        balance: formatBigNumber(kusdBalance, 45),
        needed: formatBigNumber(kusdNeeded, 45),
      });
      return {
        success: false,
        error: 'Insufficient KUSD balance',
      };
    }

    // Calculate max amount to take based on available capital
    let amountToTake = auction.lot;

    // Limit by available KUSD
    const maxAffordable = (kusdBalance * WAD) / currentPrice;
    if (maxAffordable < amountToTake) {
      amountToTake = maxAffordable;
      logger.info('Limiting bid amount by available KUSD', {
        original: formatBigNumber(auction.lot),
        limited: formatBigNumber(amountToTake),
      });
    }

    // Execute bid
    const result = await this.contractService.take(
      auction.ilk,
      auction.id,
      amountToTake,
      currentPrice
    );

    if (result.success) {
      this.bidsExecuted++;

      // Calculate profit (simplified - actual profit depends on selling the collateral)
      const spent = (amountToTake * currentPrice) / WAD;
      const value = (amountToTake * marketPrice) / WAD;
      const profit = value - spent;
      this.totalProfit = this.totalProfit + profit;

      logAuctionBid({
        auctionId: auction.id,
        ilk: auction.ilk,
        amount: formatBigNumber(amountToTake),
        price: formatBigNumber(currentPrice, 27),
        profit: formatBigNumber(profit, 45),
        txHash: result.txHash,
        success: true,
      });

      logger.info('Bid successful', {
        ilk: auction.ilk,
        auctionId: auction.id,
        amount: formatBigNumber(amountToTake),
        profit: formatBigNumber(profit, 45),
        txHash: result.txHash,
        totalBids: this.bidsExecuted,
      });
    } else {
      logAuctionBid({
        auctionId: auction.id,
        ilk: auction.ilk,
        amount: formatBigNumber(amountToTake),
        price: formatBigNumber(currentPrice, 27),
        profit: '0',
        success: false,
      });

      logger.error('Bid failed', {
        ilk: auction.ilk,
        auctionId: auction.id,
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Execute multiple bids
   */
  async executeBids(opportunities: BiddingOpportunity[]): Promise<TransactionResult[]> {
    const results: TransactionResult[] = [];

    // Sort by profitability (highest first)
    const sorted = opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);

    for (const opportunity of sorted) {
      try {
        const result = await this.executeBid(opportunity);
        results.push(result);

        // Add delay between bids to avoid nonce issues
        await this.delay(2000);
      } catch (error: any) {
        logger.error('Error executing bid', {
          auctionId: opportunity.auction.id,
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
   * Get total bids executed
   */
  getTotalBids(): number {
    return this.bidsExecuted;
  }

  /**
   * Get total profit
   */
  getTotalProfit(): bigint {
    return this.totalProfit;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

