import { ContractService } from '../services/ContractService';
import { FlopBiddingOpportunity, TransactionResult } from '../types';
import logger from '../utils/logger';

/**
 * Executor for Flopper (debt) auction bids
 * 
 * Executes Flopper.dent() to bid on debt auctions
 */
export class FlopExecutor {
  private contractService: ContractService;
  private bidsExecuted: number = 0;

  constructor(contractService: ContractService) {
    this.contractService = contractService;
  }

  /**
   * Execute bid on Flop auction
   */
  async executeBid(opportunity: FlopBiddingOpportunity): Promise<TransactionResult> {
    const { auction, maxLot } = opportunity;

    logger.info('Executing Flop bid', {
      id: auction.id,
      currentLot: auction.lot.toString(),
      maxLot: maxLot.toString(),
      bid: auction.bid.toString(),
    });

    try {
      // Check KUSD balance in Vat
      const keeperAddress = this.contractService.getKeeperAddress();
      const kusdBalance = await this.contractService.getVatBalance(keeperAddress);

      if (kusdBalance < auction.bid) {
        logger.warn('Insufficient KUSD balance in Vat for Flop bid', {
          required: auction.bid.toString(),
          available: kusdBalance.toString(),
        });
        return {
          success: false,
          error: 'Insufficient KUSD balance in Vat',
        };
      }

      // Execute dent
      const result = await this.contractService.dentFlop(
        auction.id,
        maxLot,
        auction.bid
      );

      if (result.success) {
        this.bidsExecuted++;
        
        logger.info('Flop bid successful', {
          id: auction.id,
          lot: maxLot.toString(),
          bid: auction.bid.toString(),
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
      logger.error('Flop bid execution failed', {
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

