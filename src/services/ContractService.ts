import { Contract, Wallet, JsonRpcProvider } from 'ethers';
import { KeeperConfig, Urn, Ilk, Auction, FlapAuction, FlopAuction } from '../types';
import logger from '../utils/logger';

// Import ABIs
import VatABI from '../../abis/Vat.json';
import DogABI from '../../abis/Dog.json';
import ClipperABI from '../../abis/Clipper.json';
import FlapperABI from '../../abis/Flapper.json';
import FlopperABI from '../../abis/Flopper.json';
import sKLCABI from '../../abis/sKLC.json';

/**
 * Service for interacting with KUSD smart contracts
 */
export class ContractService {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private vat: Contract;
  private dog: Contract;
  private clippers: Map<string, Contract>;
  private flapper: Contract | null;
  private flopper: Contract | null;
  private sklc: Contract | null;

  constructor(private config: KeeperConfig) {
    // Initialize provider
    this.provider = new JsonRpcProvider(config.rpcUrl);

    // Initialize wallet
    this.wallet = new Wallet(config.privateKey, this.provider);

    // Initialize core contracts
    this.vat = new Contract(config.vatAddress, VatABI.abi, this.wallet);
    this.dog = new Contract(config.dogAddress, DogABI.abi, this.wallet);

    // Initialize clipper contracts
    this.clippers = new Map();
    for (const [ilk, address] of Object.entries(config.clippers)) {
      if (address && address !== '') {
        this.clippers.set(ilk, new Contract(address, ClipperABI.abi, this.wallet));
      }
    }

    // Initialize Flapper (surplus auctions)
    this.flapper = config.flapperAddress && config.flapperAddress !== ''
      ? new Contract(config.flapperAddress, FlapperABI, this.wallet)
      : null;

    // Initialize Flopper (debt auctions)
    this.flopper = config.flopperAddress && config.flopperAddress !== ''
      ? new Contract(config.flopperAddress, FlopperABI, this.wallet)
      : null;

    // Initialize sKLC token
    this.sklc = config.sklcAddress && config.sklcAddress !== ''
      ? new Contract(config.sklcAddress, sKLCABI, this.wallet)
      : null;

    logger.info('ContractService initialized', {
      keeper: this.wallet.address,
      vat: config.vatAddress,
      dog: config.dogAddress,
      flapper: config.flapperAddress || 'not configured',
      flopper: config.flopperAddress || 'not configured',
    });
  }

  /**
   * Get keeper wallet address
   */
  getKeeperAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get current block number
   */
  async getCurrentBlock(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get urn (vault) data
   */
  async getUrn(ilk: string, urnAddress: string): Promise<Urn> {
    const urnData = await this.vat.urns(ilk, urnAddress);
    
    return {
      address: urnAddress,
      ilk,
      ink: urnData.ink,
      art: urnData.art,
    };
  }

  /**
   * Get ilk (collateral type) data
   */
  async getIlk(ilk: string): Promise<Ilk> {
    const ilkData = await this.vat.ilks(ilk);
    
    return {
      name: ilk,
      Art: ilkData.Art,
      rate: ilkData.rate,
      spot: ilkData.spot,
      line: ilkData.line,
      dust: ilkData.dust,
    };
  }

  /**
   * Get Dog contract data
   */
  async getDogData(ilk: string) {
    const [hole, dirt, ilkData] = await Promise.all([
      this.dog.Hole(),
      this.dog.Dirt(),
      this.dog.ilks(ilk),
    ]);

    return {
      hole,      // Global debt ceiling for liquidations
      dirt,      // Current total debt in liquidation
      ilkHole: ilkData.hole,  // Ilk-specific debt ceiling
      ilkDirt: ilkData.dirt,  // Ilk-specific debt in liquidation
      clip: ilkData.clip,     // Clipper address
      chop: ilkData.chop,     // Liquidation penalty
    };
  }

  /**
   * Trigger liquidation (bark)
   */
  async bark(ilk: string, urnAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      logger.info('Triggering liquidation', { ilk, urn: urnAddress });

      const tx = await this.dog.bark(ilk, urnAddress, this.wallet.address, {
        gasLimit: this.config.gasLimit,
        gasPrice: this.config.gasPrice,
        type: 0, // Legacy transaction for KalyChain
      });

      logger.info('Liquidation transaction sent', { txHash: tx.hash });

      const receipt = await tx.wait();

      logger.info('Liquidation confirmed', {
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      logger.error('Liquidation failed', {
        ilk,
        urn: urnAddress,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get clipper contract for ilk
   */
  getClipper(ilk: string): Contract | undefined {
    return this.clippers.get(ilk);
  }

  /**
   * Get active auction data
   */
  async getAuction(ilk: string, auctionId: number): Promise<Auction | null> {
    const clipper = this.getClipper(ilk);
    if (!clipper) {
      return null;
    }

    try {
      const sale = await clipper.sales(auctionId);
      
      return {
        id: auctionId,
        ilk,
        urn: sale.usr,
        usr: sale.usr,
        tab: sale.tab,
        lot: sale.lot,
        top: sale.top,
        tic: sale.tic,
        pos: sale.pos,
        active: sale.tab.gt(0),
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Subscribe to Vat.Frob events
   */
  onVatFrob(callback: (ilk: string, urn: string, event: any) => void) {
    this.vat.on('Frob', (ilk: string, urn: string, _v: string, _w: string, _dink: bigint, _dart: bigint, event: any) => {
      callback(ilk, urn, event);
    });
  }

  /**
   * Subscribe to Dog.Bark events
   */
  onDogBark(callback: (ilk: string, urn: string, auctionId: number, event: any) => void) {
    this.dog.on('Bark', (ilk: string, urn: string, _ink: bigint, _art: bigint, _due: bigint, _clip: string, id: bigint, event: any) => {
      callback(ilk, urn, Number(id), event);
    });
  }

  /**
   * Get past Vat.Frob events
   */
  async getPastFrobEvents(fromBlock: number, toBlock: number | string = 'latest') {
    const filter = this.vat.filters.Frob();
    return await this.vat.queryFilter(filter, fromBlock, toBlock);
  }

  /**
   * Get KUSD balance in Vat for keeper
   */
  async getKusdBalance(): Promise<bigint> {
    const dai = await this.vat.dai(this.wallet.address);
    return dai;
  }

  /**
   * Bid on auction (take)
   */
  async take(
    ilk: string,
    auctionId: number,
    amount: bigint,
    maxPrice: bigint
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const clipper = this.getClipper(ilk);
      if (!clipper) {
        return {
          success: false,
          error: `No clipper found for ${ilk}`,
        };
      }

      logger.info('Bidding on auction', {
        ilk,
        auctionId,
        amount: amount.toString(),
        maxPrice: maxPrice.toString(),
      });

      const tx = await clipper.take(
        auctionId,
        amount,
        maxPrice,
        this.wallet.address,
        '0x', // No callback data
        {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice,
          type: 0, // Legacy transaction for KalyChain
        }
      );

      logger.info('Bid transaction sent', { txHash: tx.hash });

      const receipt = await tx.wait();

      logger.info('Bid confirmed', {
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      logger.error('Bid failed', {
        ilk,
        auctionId,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // Flapper (Surplus Auction) Methods
  // ============================================================================

  /**
   * Get Flapper contract
   */
  getFlapper(): Contract | null {
    return this.flapper;
  }

  /**
   * Subscribe to Flapper Kick events
   */
  onFlapperKick(callback: (id: bigint, lot: bigint, bid: bigint, event: any) => void) {
    if (!this.flapper) {
      throw new Error('Flapper not configured');
    }
    this.flapper.on('Kick', callback);
  }

  /**
   * Get Flapper auction data
   */
  async getFlapAuction(id: number): Promise<FlapAuction> {
    if (!this.flapper) {
      throw new Error('Flapper not configured');
    }

    const bid = await this.flapper.bids(id);

    return {
      id,
      bid: bid.bid,
      lot: bid.lot,
      guy: bid.guy,
      tic: Number(bid.tic),
      end: Number(bid.end),
      active: bid.guy !== '0x0000000000000000000000000000000000000000',
    };
  }

  /**
   * Bid on Flapper auction (tend)
   */
  async tendFlap(id: number, lot: bigint, bid: bigint): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.flapper) {
      throw new Error('Flapper not configured');
    }

    try {
      logger.info('Bidding on Flap auction', { id, lot: lot.toString(), bid: bid.toString() });

      const tx = await this.flapper.tend(id, lot, bid, {
        gasLimit: this.config.gasLimit,
        gasPrice: this.config.gasPrice,
        type: 0,
      });

      const receipt = await tx.wait();
      logger.info('Flap bid confirmed', { txHash: receipt.transactionHash });

      return { success: true, txHash: receipt.transactionHash };
    } catch (error: any) {
      logger.error('Flap bid failed', { id, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get sKLC balance
   */
  async getSKLCBalance(address: string): Promise<bigint> {
    if (!this.sklc) {
      throw new Error('sKLC not configured');
    }
    return await this.sklc.balanceOf(address);
  }

  /**
   * Approve sKLC spending
   */
  async approveSKLC(spender: string, amount: bigint): Promise<void> {
    if (!this.sklc) {
      throw new Error('sKLC not configured');
    }

    const tx = await this.sklc.approve(spender, amount, {
      gasLimit: this.config.gasLimit,
      gasPrice: this.config.gasPrice,
      type: 0,
    });

    await tx.wait();
    logger.info('sKLC approved', { spender, amount: amount.toString() });
  }

  // ============================================================================
  // Flopper (Debt Auction) Methods
  // ============================================================================

  /**
   * Get Flopper contract
   */
  getFlopper(): Contract | null {
    return this.flopper;
  }

  /**
   * Subscribe to Flopper Kick events
   */
  onFlopperKick(callback: (id: bigint, lot: bigint, bid: bigint, gal: string, event: any) => void) {
    if (!this.flopper) {
      throw new Error('Flopper not configured');
    }
    this.flopper.on('Kick', callback);
  }

  /**
   * Get Flopper auction data
   */
  async getFlopAuction(id: number): Promise<FlopAuction> {
    if (!this.flopper) {
      throw new Error('Flopper not configured');
    }

    const bid = await this.flopper.bids(id);

    return {
      id,
      bid: bid.bid,
      lot: bid.lot,
      guy: bid.guy,
      gal: bid.guy, // In Flopper, guy is initially the Vow (gal)
      tic: Number(bid.tic),
      end: Number(bid.end),
      active: bid.guy !== '0x0000000000000000000000000000000000000000',
    };
  }

  /**
   * Bid on Flopper auction (dent)
   */
  async dentFlop(id: number, lot: bigint, bid: bigint): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.flopper) {
      throw new Error('Flopper not configured');
    }

    try {
      logger.info('Bidding on Flop auction', { id, lot: lot.toString(), bid: bid.toString() });

      const tx = await this.flopper.dent(id, lot, bid, {
        gasLimit: this.config.gasLimit,
        gasPrice: this.config.gasPrice,
        type: 0,
      });

      const receipt = await tx.wait();
      logger.info('Flop bid confirmed', { txHash: receipt.transactionHash });

      return { success: true, txHash: receipt.transactionHash };
    } catch (error: any) {
      logger.error('Flop bid failed', { id, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get KUSD balance in Vat for an address
   */
  async getVatBalance(address: string): Promise<bigint> {
    try {
      const balance = await this.vat.kusd(address);
      return balance;
    } catch (error: any) {
      logger.error('Failed to get Vat balance', { address, error: error.message });
      throw error;
    }
  }
}

