import { Contract } from 'ethers';
import logger from './logger';

/**
 * Vat Balance Management Utilities
 * 
 * Handles moving KUSD between wallet and Vat internal balance
 */

export class VatBalanceManager {
  private vat: Contract;
  private kusdJoin: Contract;
  private kusd: Contract;
  private keeperAddress: string;

  constructor(
    vat: Contract,
    kusdJoin: Contract,
    kusd: Contract,
    keeperAddress: string
  ) {
    this.vat = vat;
    this.kusdJoin = kusdJoin;
    this.kusd = kusd;
    this.keeperAddress = keeperAddress;
  }

  /**
   * Get KUSD balance in Vat (internal balance)
   */
  async getVatBalance(): Promise<bigint> {
    try {
      const balance = await this.vat.kusd(this.keeperAddress);
      return balance;
    } catch (error) {
      logger.error('Failed to get Vat balance', { error });
      throw error;
    }
  }

  /**
   * Get KUSD balance in wallet (ERC20 balance)
   */
  async getWalletBalance(): Promise<bigint> {
    try {
      const balance = await this.kusd.balanceOf(this.keeperAddress);
      return balance;
    } catch (error) {
      logger.error('Failed to get wallet balance', { error });
      throw error;
    }
  }

  /**
   * Move KUSD from wallet to Vat
   * @param amount Amount in WAD (18 decimals)
   */
  async moveToVat(amount: bigint): Promise<void> {
    try {
      logger.info('Moving KUSD from wallet to Vat', {
        amount: amount.toString(),
        amountInKUSD: Number(amount) / Number(10n ** 18n),
      });

      // 1. Approve KusdJoin to spend KUSD
      const approveTx = await this.kusd.approve(
        await this.kusdJoin.getAddress(),
        amount
      );
      await approveTx.wait();
      logger.info('Approved KusdJoin', { txHash: approveTx.hash });

      // 2. Join KUSD to Vat
      const joinTx = await this.kusdJoin.join(this.keeperAddress, amount);
      await joinTx.wait();
      logger.info('Joined KUSD to Vat', { txHash: joinTx.hash });

      logger.info('Successfully moved KUSD to Vat');
    } catch (error) {
      logger.error('Failed to move KUSD to Vat', { error });
      throw error;
    }
  }

  /**
   * Move KUSD from Vat to wallet
   * @param amount Amount in WAD (18 decimals)
   */
  async moveToWallet(amount: bigint): Promise<void> {
    try {
      logger.info('Moving KUSD from Vat to wallet', {
        amount: amount.toString(),
        amountInKUSD: Number(amount) / Number(10n ** 18n),
      });

      // Exit KUSD from Vat
      const exitTx = await this.kusdJoin.exit(this.keeperAddress, amount);
      await exitTx.wait();
      logger.info('Exited KUSD from Vat', { txHash: exitTx.hash });

      logger.info('Successfully moved KUSD to wallet');
    } catch (error) {
      logger.error('Failed to move KUSD to wallet', { error });
      throw error;
    }
  }

  /**
   * Ensure minimum KUSD balance in Vat
   * Moves KUSD from wallet if needed
   */
  async ensureVatBalance(minBalance: bigint): Promise<void> {
    try {
      const vatBalance = await this.getVatBalance();
      
      if (vatBalance >= minBalance) {
        logger.info('Vat balance sufficient', {
          current: vatBalance.toString(),
          required: minBalance.toString(),
        });
        return;
      }

      const needed = minBalance - vatBalance;
      const walletBalance = await this.getWalletBalance();

      if (walletBalance < needed) {
        logger.warn('Insufficient KUSD in wallet to meet Vat balance requirement', {
          needed: needed.toString(),
          available: walletBalance.toString(),
        });
        return;
      }

      logger.info('Moving KUSD to Vat to meet minimum balance', {
        needed: needed.toString(),
      });

      await this.moveToVat(needed);
    } catch (error) {
      logger.error('Failed to ensure Vat balance', { error });
      throw error;
    }
  }

  /**
   * Get total KUSD balance (wallet + Vat)
   */
  async getTotalBalance(): Promise<{ wallet: bigint; vat: bigint; total: bigint }> {
    const wallet = await this.getWalletBalance();
    const vat = await this.getVatBalance();
    return {
      wallet,
      vat,
      total: wallet + vat,
    };
  }
}

