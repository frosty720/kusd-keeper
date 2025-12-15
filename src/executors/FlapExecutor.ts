import { ContractService } from '../services/ContractService';
import { FlapBiddingOpportunity, TransactionResult } from '../types';
import logger from '../utils/logger';

/**
 * Executor for Flapper (surplus) auction bids
 * 
 * Executes Flapper.tend() to bid on surplus auctions
 */
export class FlapExecutor {
  private contractService: ContractService;
  private bidsExecuted: number = 0;

  constructor(contractService: ContractService) {
    this.contractService = contractService;
  }

  /**
   * Execute bid on Flap auction
   */
  async executeBid(opportunity: FlapBiddingOpportunity): Promise<TransactionResult> {
    const { auction, minBid } = opportunity;

    logger.info('Executing Flap bid', {
      id: auction.id,
      currentBid: auction.bid.toString(),
      minBid: minBid.toString(),
      lot: auction.lot.toString(),
    });

    try {
      // Check sKLC balance
      const keeperAddress = this.contractService.getKeeperAddress();
      const sklcBalance = await this.contractService.getSKLCBalance(keeperAddress);

      if (sklcBalance < minBid) {
        logger.warn('Insufficient sKLC balance for Flap bid', {
          required: minBid.toString(),
          available: sklcBalance.toString(),
        });
        return {
          success: false,
          error: 'Insufficient sKLC balance',
        };
      }

      // Approve sKLC spending if needed
      const flapper = this.contractService.getFlapper();
      if (!flapper) {
        return {
          success: false,
          error: 'Flapper not configured',
        };
      }

      const flapperAddress = await flapper.getAddress();
      await this.contractService.approveSKLC(flapperAddress, minBid);

      // Execute tend
      const result = await this.contractService.tendFlap(
        auction.id,
        auction.lot,
        minBid
      );

      if (result.success) {
        this.bidsExecuted++;
        
        logger.info('Flap bid successful', {
          id: auction.id,
          bid: minBid.toString(),
          txHash: result.txHash,
          totalBids: this.bidsExecuted,
        });
      }

      return {
        success: result.success,
        transactionHash: result.txHash,
        error: result.error,
      };
    } catch (error: any) {
      logger.error('Flap bid execution failed', {
        id: auction.id,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get total bids executed
   */
  getBidsExecuted(): number {
    return this.bidsExecuted;
  }
}

