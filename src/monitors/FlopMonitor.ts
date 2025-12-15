import { ContractService } from '../services/ContractService';
import { FlopAuction, FlopBiddingOpportunity } from '../types';
import logger from '../utils/logger';
import { WAD } from '../utils/calculations';

/**
 * Monitor for Flopper (debt) auctions
 * 
 * Flop auctions mint sKLC tokens to cover system debt
 * Keepers bid LESS sKLC for the same amount of KUSD
 */
export class FlopMonitor {
  private activeAuctions: Map<number, FlopAuction>;
  private contractService: ContractService;
  private beg: bigint; // Minimum lot decrease (e.g., 0.95 = 5% decrease)

  constructor(contractService: ContractService) {
    this.contractService = contractService;
    this.activeAuctions = new Map();
    this.beg = 95n * WAD / 100n; // Default 5% minimum decrease
  }

  /**
   * Start monitoring Flopper auctions
   */
  async start(): Promise<void> {
    logger.info('Starting FlopMonitor');

    const flopper = this.contractService.getFlopper();
    if (!flopper) {
      logger.warn('Flopper not configured, skipping Flop auction monitoring');
      return;
    }

    // Get beg parameter from Flopper
    try {
      this.beg = await flopper.beg();
      logger.info('Flopper beg parameter', { beg: this.beg.toString() });
    } catch (error) {
      logger.warn('Failed to get Flopper beg, using default 5%');
    }

    // Subscribe to Kick events
    this.contractService.onFlopperKick(this.handleKick.bind(this));

    logger.info('FlopMonitor started');
  }

  /**
   * Handle Flopper Kick event (new debt auction)
   */
  private async handleKick(id: bigint, lot: bigint, bid: bigint, gal: string, _event: any): Promise<void> {
    const auctionId = Number(id);
    
    logger.info('New Flop auction detected', {
      id: auctionId,
      lot: lot.toString(),
      bid: bid.toString(),
      gal,
      lotInSKLC: Number(lot) / Number(WAD),
      bidInKUSD: Number(bid) / Number(10n ** 45n), // RAD to KUSD
    });

    // Fetch full auction data
    try {
      const auction = await this.contractService.getFlopAuction(auctionId);
      this.activeAuctions.set(auctionId, auction);
      
      logger.info('Flop auction added to monitoring', {
        id: auctionId,
        totalAuctions: this.activeAuctions.size,
      });
    } catch (error) {
      logger.error('Failed to fetch Flop auction data', { id: auctionId, error });
    }
  }

  /**
   * Check all active auctions for bidding opportunities
   */
  async checkOpportunities(): Promise<FlopBiddingOpportunity[]> {
    const opportunities: FlopBiddingOpportunity[] = [];

    for (const [id, _auction] of this.activeAuctions.entries()) {
      try {
        // Refresh auction data
        const updated = await this.contractService.getFlopAuction(id);
        
        // Remove if auction ended
        if (!updated.active) {
          this.activeAuctions.delete(id);
          logger.info('Flop auction ended', { id });
          continue;
        }

        // Update cached data
        this.activeAuctions.set(id, updated);

        // Check if auction is still running
        const now = Math.floor(Date.now() / 1000);
        if (updated.end > 0 && now > updated.end) {
          logger.info('Flop auction expired', { id });
          continue;
        }

        // Calculate maximum lot (minimum sKLC we'd accept)
        const maxLot = (updated.lot * this.beg) / WAD;

        // Check if we should bid
        // For Flop auctions, we need to evaluate if accepting newly minted sKLC
        // in exchange for KUSD is profitable
        // This depends on the keeper's strategy and sKLC valuation
        
        const opportunity: FlopBiddingOpportunity = {
          auction: updated,
          maxLot,
          profitable: false, // Keeper must implement profitability logic
          estimatedProfit: 0n,
        };

        opportunities.push(opportunity);
      } catch (error) {
        logger.error('Failed to check Flop auction', { id, error });
      }
    }

    return opportunities;
  }

  /**
   * Get active auction count
   */
  getActiveAuctionCount(): number {
    return this.activeAuctions.size;
  }

  /**
   * Get all active auctions
   */
  getActiveAuctions(): FlopAuction[] {
    return Array.from(this.activeAuctions.values());
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.activeAuctions.clear();
    logger.info('FlopMonitor stopped');
  }
}

