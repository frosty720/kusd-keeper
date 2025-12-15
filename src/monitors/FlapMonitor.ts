import { ContractService } from '../services/ContractService';
import { FlapAuction, FlapBiddingOpportunity } from '../types';
import logger from '../utils/logger';
import { WAD } from '../utils/calculations';

/**
 * Monitor for Flapper (surplus) auctions
 * 
 * Flap auctions sell surplus KUSD for sKLC tokens
 * Keepers bid MORE sKLC for the same amount of KUSD
 */
export class FlapMonitor {
  private activeAuctions: Map<number, FlapAuction>;
  private contractService: ContractService;
  private beg: bigint; // Minimum bid increase (e.g., 1.05 = 5% increase)

  constructor(contractService: ContractService) {
    this.contractService = contractService;
    this.activeAuctions = new Map();
    this.beg = 105n * WAD / 100n; // Default 5% minimum increase
  }

  /**
   * Start monitoring Flapper auctions
   */
  async start(): Promise<void> {
    logger.info('Starting FlapMonitor');

    const flapper = this.contractService.getFlapper();
    if (!flapper) {
      logger.warn('Flapper not configured, skipping Flap auction monitoring');
      return;
    }

    // Get beg parameter from Flapper
    try {
      this.beg = await flapper.beg();
      logger.info('Flapper beg parameter', { beg: this.beg.toString() });
    } catch (error) {
      logger.warn('Failed to get Flapper beg, using default 5%');
    }

    // Subscribe to Kick events
    this.contractService.onFlapperKick(this.handleKick.bind(this));

    logger.info('FlapMonitor started');
  }

  /**
   * Handle Flapper Kick event (new surplus auction)
   */
  private async handleKick(id: bigint, lot: bigint, bid: bigint, _event: any): Promise<void> {
    const auctionId = Number(id);
    
    logger.info('New Flap auction detected', {
      id: auctionId,
      lot: lot.toString(),
      bid: bid.toString(),
      lotInKUSD: Number(lot) / Number(10n ** 45n), // RAD to KUSD
      bidInSKLC: Number(bid) / Number(WAD),
    });

    // Fetch full auction data
    try {
      const auction = await this.contractService.getFlapAuction(auctionId);
      this.activeAuctions.set(auctionId, auction);
      
      logger.info('Flap auction added to monitoring', {
        id: auctionId,
        totalAuctions: this.activeAuctions.size,
      });
    } catch (error) {
      logger.error('Failed to fetch Flap auction data', { id: auctionId, error });
    }
  }

  /**
   * Check all active auctions for bidding opportunities
   */
  async checkOpportunities(): Promise<FlapBiddingOpportunity[]> {
    const opportunities: FlapBiddingOpportunity[] = [];

    for (const [id, _auction] of this.activeAuctions.entries()) {
      try {
        // Refresh auction data
        const updated = await this.contractService.getFlapAuction(id);
        
        // Remove if auction ended
        if (!updated.active) {
          this.activeAuctions.delete(id);
          logger.info('Flap auction ended', { id });
          continue;
        }

        // Update cached data
        this.activeAuctions.set(id, updated);

        // Check if auction is still running
        const now = Math.floor(Date.now() / 1000);
        if (updated.end > 0 && now > updated.end) {
          logger.info('Flap auction expired', { id });
          continue;
        }

        // Calculate minimum bid required
        const minBid = (updated.bid * this.beg) / WAD;

        // Check if we should bid
        // For Flap auctions, we need to evaluate if buying KUSD with sKLC is profitable
        // This depends on the keeper's strategy and sKLC valuation
        
        const opportunity: FlapBiddingOpportunity = {
          auction: updated,
          minBid,
          profitable: false, // Keeper must implement profitability logic
          estimatedProfit: 0n,
        };

        opportunities.push(opportunity);
      } catch (error) {
        logger.error('Failed to check Flap auction', { id, error });
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
  getActiveAuctions(): FlapAuction[] {
    return Array.from(this.activeAuctions.values());
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.activeAuctions.clear();
    logger.info('FlapMonitor stopped');
  }
}

