import { ContractService } from '../services/ContractService';
import { PriceService } from '../services/PriceService';
import { KeeperConfig, Auction, BiddingOpportunity } from '../types';
import logger, { logAuctionCheck } from '../utils/logger';
import { calculateProfitPercentage, calculateAuctionPrice } from '../utils/calculations';
import { ilkToCollateralType } from '../config/config';

/**
 * Monitors active auctions for bidding opportunities
 */
export class AuctionMonitor {
  private activeAuctions: Map<string, Auction[]>; // ilk -> auctions

  constructor(
    private contractService: ContractService,
    private priceService: PriceService,
    private config: KeeperConfig
  ) {
    this.activeAuctions = new Map();
  }

  /**
   * Start monitoring auctions
   */
  async start(): Promise<void> {
    logger.info('Starting AuctionMonitor');

    // Subscribe to Dog.Bark events (new auctions)
    this.subscribeToBarkEvents();

    logger.info('AuctionMonitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    logger.info('AuctionMonitor stopped');
  }

  /**
   * Subscribe to Dog.Bark events for new auctions
   */
  private subscribeToBarkEvents(): void {
    this.contractService.onDogBark((ilk: string, urn: string, auctionId: number, event: any) => {
      logger.info('New auction detected', {
        ilk,
        urn,
        auctionId,
        block: event.blockNumber,
      });

      // Add to active auctions
      this.addAuction(ilk, auctionId);
    });
  }

  /**
   * Add auction to monitoring list
   */
  private async addAuction(ilk: string, auctionId: number): Promise<void> {
    try {
      const auction = await this.contractService.getAuction(ilk, auctionId);
      if (auction && auction.active) {
        if (!this.activeAuctions.has(ilk)) {
          this.activeAuctions.set(ilk, []);
        }
        this.activeAuctions.get(ilk)!.push(auction);

        logger.info('Auction added to monitoring', {
          ilk,
          auctionId,
          tab: auction.tab.toString(),
          lot: auction.lot.toString(),
        });
      }
    } catch (error: any) {
      logger.error('Failed to add auction', {
        ilk,
        auctionId,
        error: error.message,
      });
    }
  }

  /**
   * Check all active auctions for bidding opportunities
   */
  async checkAuctions(): Promise<BiddingOpportunity[]> {
    const startTime = Date.now();
    const opportunities: BiddingOpportunity[] = [];

    for (const [ilk, auctions] of this.activeAuctions.entries()) {
      for (const auction of auctions) {
        try {
          // Refresh auction data
          const currentAuction = await this.contractService.getAuction(ilk, auction.id);
          
          if (!currentAuction || !currentAuction.active) {
            // Auction completed or cancelled, remove from list
            this.removeAuction(ilk, auction.id);
            continue;
          }

          // Get current auction price
          const currentTime = Math.floor(Date.now() / 1000);
          const currentPrice = calculateAuctionPrice(
            currentAuction.top,
            currentAuction.tic,
            21600, // 6 hours in seconds (from Config.sol)
            currentTime
          );

          // Get market price
          const collateralType = ilkToCollateralType(ilk);
          if (!collateralType) {
            continue;
          }

          const marketPrice = await this.priceService.getPrice(collateralType);

          // Calculate profit percentage
          const profitPercentage = calculateProfitPercentage(currentPrice, marketPrice);

          // Check if profitable
          const profitable = profitPercentage >= this.config.minProfitPercentage;

          if (profitable) {
            opportunities.push({
              auction: currentAuction,
              currentPrice,
              marketPrice,
              profitPercentage,
              profitable: true,
              maxTake: currentAuction.lot, // Can be optimized based on capital
            });

            logger.info('Profitable auction found', {
              ilk,
              auctionId: auction.id,
              currentPrice: currentPrice.toString(),
              marketPrice: marketPrice.toString(),
              profit: profitPercentage.toFixed(2) + '%',
            });
          }
        } catch (error: any) {
          logger.error('Error checking auction', {
            ilk,
            auctionId: auction.id,
            error: error.message,
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    logAuctionCheck({
      activeAuctions: this.getTotalAuctionCount(),
      profitableAuctions: opportunities.length,
      duration,
    });

    return opportunities;
  }

  /**
   * Remove auction from monitoring list
   */
  private removeAuction(ilk: string, auctionId: number): void {
    const auctions = this.activeAuctions.get(ilk);
    if (auctions) {
      const index = auctions.findIndex(a => a.id === auctionId);
      if (index !== -1) {
        auctions.splice(index, 1);
        logger.debug('Auction removed from monitoring', { ilk, auctionId });
      }
    }
  }

  /**
   * Get total number of active auctions
   */
  private getTotalAuctionCount(): number {
    let count = 0;
    for (const auctions of this.activeAuctions.values()) {
      count += auctions.length;
    }
    return count;
  }

  /**
   * Get active auctions count
   */
  getActiveAuctionsCount(): number {
    return this.getTotalAuctionCount();
  }
}

