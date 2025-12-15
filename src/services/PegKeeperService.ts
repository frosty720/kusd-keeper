import { ethers } from 'ethers';
import { KeeperConfig } from '../types';
import { ContractService } from './ContractService';
import logger from '../utils/logger';

// Minimal ABIs
const PSM_ABI = [
    'function sellGem(address usr, uint256 gemAmt) external returns (uint256)',
    'function buyGem(address usr, uint256 gemAmt) external returns (uint256)',
    'function tin() external view returns (uint256)',
    'function tout() external view returns (uint256)',
    'function gem() external view returns (address)',
    'function kusd() external view returns (address)'
];

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)'
];

const ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];



export class PegKeeperService {
    private psm: ethers.Contract;
    private router: ethers.Contract;
    // private pair: ethers.Contract; // Removed
    private gem: ethers.Contract | null = null;
    private kusd: ethers.Contract | null = null;
    private wallet: ethers.Wallet;
    private config: KeeperConfig;

    constructor(contractService: ContractService, config: KeeperConfig) {
        this.config = config;
        this.wallet = contractService['wallet']; // Accessing protected wallet
        // this.provider = contractService['provider']; // Removed as it's not used

        if (!config.psmAddress || !config.dexRouterAddress || !config.dexPairAddress) {
            throw new Error('Missing Peg Keeper configuration (PSM, Router, or Pair address)');
        }

        this.psm = new ethers.Contract(config.psmAddress, PSM_ABI, this.wallet);
        this.router = new ethers.Contract(config.dexRouterAddress, ROUTER_ABI, this.wallet);
        // this.pair = new ethers.Contract(config.dexPairAddress, PAIR_ABI, this.wallet);
    }

    async initialize() {
        const gemAddress = await this.psm.gem();
        const kusdAddress = await this.psm.kusd();
        this.gem = new ethers.Contract(gemAddress, ERC20_ABI, this.wallet);
        this.kusd = new ethers.Contract(kusdAddress, ERC20_ABI, this.wallet);
        logger.info('PegKeeperService initialized', { gem: gemAddress, kusd: kusdAddress });
    }

    async checkAndArbitrage(): Promise<{ executed: boolean; profit: bigint }> {
        if (!this.gem || !this.kusd) await this.initialize();

        try {
            const price = await this.getKusdPrice();
            logger.debug(`Current KUSD Price: $${price.toFixed(4)}`);

            if (price > this.config.pegUpperLimit) {
                logger.info(`Price > ${this.config.pegUpperLimit}, attempting arb (Mint KUSD -> Sell on DEX)`);
                return await this.arbHighPrice();
            } else if (price < this.config.pegLowerLimit) {
                logger.info(`Price < ${this.config.pegLowerLimit}, attempting arb (Buy KUSD -> Redeem USDC)`);
                return await this.arbLowPrice();
            }

            return { executed: false, profit: 0n };
        } catch (error: any) {
            logger.error('Error in PegKeeper check', { error: error.message });
            return { executed: false, profit: 0n };
        }
    }

    private async getKusdPrice(): Promise<number> {
        // Determine which token is KUSD in the pair
        // const token0 = await this.pair.token0();
        // const reserves = await this.pair.getReserves();

        // Assuming 18 decimals for both for simplicity in this calculation, 
        // but strictly we should check decimals. 
        // KUSD is 18 decimals. USDC is usually 6.

        // const kusdIsToken0 = token0.toLowerCase() === this.kusd!.target.toString().toLowerCase();

        // const r0 = BigInt(reserves[0]);
        // const r1 = BigInt(reserves[1]);

        // We need to normalize decimals to get a price.
        // Let's use the router to get a more accurate "market price" for 1 USDC
        const gemDecimals = await this.gem!.decimals();
        const oneGem = ethers.parseUnits('1', gemDecimals);

        // Path: GEM -> KUSD
        const path = [this.gem!.target, this.kusd!.target];
        const amounts = await this.router.getAmountsOut(oneGem, path);
        const kusdOut = amounts[1]; // Amount of KUSD for 1 GEM (USDC)

        // If 1 USDC buys 1.02 KUSD, then KUSD price is ~ $0.98 (Low)
        // If 1 USDC buys 0.98 KUSD, then KUSD price is ~ $1.02 (High)

        // Price of KUSD in USDC = 1 / (KUSD received for 1 USDC)
        const kusdReceived = parseFloat(ethers.formatUnits(kusdOut, 18));
        const price = 1 / kusdReceived;

        return price;
    }

    private async arbHighPrice(): Promise<{ executed: boolean; profit: bigint }> {
        // KUSD is expensive (> $1.01).
        // Strategy: Mint KUSD using USDC (PSM) -> Sell KUSD for USDC (DEX)
        // 1. Check USDC balance
        // 1. Check USDC balance
        const gemBalance = BigInt(await this.gem!.balanceOf(this.wallet.address));
        if (gemBalance === 0n) {
            logger.warn('No USDC balance to perform arb');
            return { executed: false, profit: 0n };
        }

        // Use a fixed amount for now, or calculate optimal
        const amountIn = gemBalance > ethers.parseUnits('1000', 6) ? ethers.parseUnits('1000', 6) : gemBalance;

        // 1. Approve PSM
        await (await this.gem!.approve(this.psm.target, amountIn)).wait();

        // 2. Sell Gem to PSM (Mint KUSD)
        // sellGem(usr, gemAmt) -> returns kusdOut
        const tx1 = await this.psm.sellGem(this.wallet.address, amountIn);
        await tx1.wait();

        // Calculate KUSD received (approx 1:1)
        // We can just check balance change or assume 1:1 minus fee
        const kusdBalance = await this.kusd!.balanceOf(this.wallet.address);

        // 3. Approve Router
        await (await this.kusd!.approve(this.router.target, kusdBalance)).wait();

        // 4. Swap KUSD -> USDC on DEX
        const path = [this.kusd!.target, this.gem!.target];
        const minOut = 0n; // Slippage protection should be added in prod
        const tx2 = await this.router.swapExactTokensForTokens(
            kusdBalance,
            minOut,
            path,
            this.wallet.address,
            Math.floor(Date.now() / 1000) + 60
        );
        await tx2.wait();

        const newGemBalance = BigInt(await this.gem!.balanceOf(this.wallet.address));
        const profit = newGemBalance - gemBalance;

        logger.info(`Arb executed. Profit: ${ethers.formatUnits(profit, 6)} USDC`);
        return { executed: true, profit };
    }

    private async arbLowPrice(): Promise<{ executed: boolean; profit: bigint }> {
        // KUSD is cheap (< $0.99).
        // Strategy: Buy KUSD with USDC (DEX) -> Redeem USDC (PSM)

        const gemBalance = BigInt(await this.gem!.balanceOf(this.wallet.address));
        if (gemBalance === 0n) {
            logger.warn('No USDC balance to perform arb');
            return { executed: false, profit: 0n };
        }

        const amountIn = gemBalance > ethers.parseUnits('1000', 6) ? ethers.parseUnits('1000', 6) : gemBalance;

        // 1. Approve Router
        await (await this.gem!.approve(this.router.target, amountIn)).wait();

        // 2. Swap USDC -> KUSD on DEX
        const path = [this.gem!.target, this.kusd!.target];
        const minOut = 0n;
        const tx1 = await this.router.swapExactTokensForTokens(
            amountIn,
            minOut,
            path,
            this.wallet.address,
            Math.floor(Date.now() / 1000) + 60
        );
        await tx1.wait();

        const kusdBalance = await this.kusd!.balanceOf(this.wallet.address);

        // 3. Approve PSM
        await (await this.kusd!.approve(this.psm.target, kusdBalance)).wait();

        // 4. Buy Gem from PSM (Burn KUSD)
        // buyGem(usr, gemAmt) -> takes KUSD, gives Gem
        // We need to calculate how much Gem we get. buyGem takes 'gemAmt' as input, not kusdIn.
        // KUSD required = gemAmt * conversion + fee.
        // We have kusdBalance. We need to reverse calculate gemAmt.
        // Roughly gemAmt = kusdBalance / conversion.

        // For simplicity, let's just query how much we can buy or just try to buy 1:1 and let it fail if not enough KUSD (not ideal)
        // Better: Calculate exact gem amount.
        // Assuming 1:1 and 18 decimals KUSD, 6 decimals USDC.
        // gemAmt = kusdBalance / 10^12
        const gemDecimals = await this.gem!.decimals();
        const conversion = 10n ** (18n - BigInt(gemDecimals));
        // const gemAmt = kusdBalance / conversion; // Ignoring fee for a moment, this might revert if fee exists

        // If there is a fee (tout), we need less gemAmt.
        // kusdIn = gemAmt * conv + (gemAmt * conv * tout / WAD)
        // kusdIn = gemAmt * conv * (1 + tout/WAD)
        // gemAmt = kusdIn / (conv * (1 + tout/WAD))

        const tout = await this.psm.tout();
        const WAD = 10n ** 18n;
        const feeMultiplier = WAD + tout;
        const gemAmtWithFee = (kusdBalance * WAD) / (conversion * feeMultiplier);

        const tx2 = await this.psm.buyGem(this.wallet.address, gemAmtWithFee);
        await tx2.wait();

        const newGemBalance = BigInt(await this.gem!.balanceOf(this.wallet.address));
        const profit = newGemBalance - gemBalance;

        logger.info(`Arb executed. Profit: ${ethers.formatUnits(profit, 6)} USDC`);
        return { executed: true, profit };
    }
}
