# KUSD Keeper

TypeScript-based keeper bot for the KUSD stablecoin system on KalyChain. Earn rewards by helping maintain the health and stability of KUSD.

## What is a Keeper?

Keepers are **independent operators** who run bots to maintain decentralized protocols. Anyone can run this keeper software to:

- **Earn money** by performing critical system functions
- **Help maintain KUSD's $1 peg** through arbitrage
- **Keep the system healthy** by liquidating risky vaults
- **Participate in auctions** to buy collateral at a discount

The KUSD system is designed to have **multiple competing keepers** — this ensures fast responses and decentralized maintenance.

## Earning Opportunities

| Service | How You Earn | Capital Needed |
|---------|--------------|----------------|
| **Liquidation Triggering** | 100 KUSD + 2% of debt per liquidation | Only KLC for gas |
| **Collateral Auctions** | Buy collateral below market price | KUSD in Vat |
| **Peg Arbitrage** | Profit from KUSD price deviations | USDC + KUSD |
| **Surplus Auctions** | Buy KUSD with sKLC at discount | sKLC tokens |
| **Debt Auctions** | Accept sKLC for KUSD at premium | KUSD in Vat |

## Features

- **Vault Monitoring**: Tracks all vaults and detects unsafe positions
- **Liquidation Triggering**: Calls `Dog.bark()` to liquidate unsafe vaults
- **Collateral Auction Participation**: Bids on Clipper auctions when profitable
- **Peg Stability Arbitrage**: Trades KUSD↔USDC to maintain the $1 peg
- **Surplus/Debt Auctions**: Participates in Flapper and Flopper auctions
- **Multi-Collateral Support**: WBTC, WETH, USDT, USDC, DAI
- **Safety Features**: Profit thresholds, emergency stop, comprehensive monitoring

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/KalyChain/KUSD.git
cd KUSD/kusd-keeper

# 2. Install dependencies
npm install

# 3. Configure your keeper
cp .env.example .env
nano .env  # Add your private key and settings

# 4. Build and run
npm run build
npm start
```

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## How Peg Arbitrage Works

The Peg Stability Module (PSM) allows 1:1 swaps between KUSD and USDC. When KUSD deviates from $1, arbitrage opportunities appear:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Peg Arbitrage Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   KUSD < $1 (e.g., $0.98)              KUSD > $1 (e.g., $1.02)  │
│   ┌─────────────────────┐              ┌─────────────────────┐  │
│   │ 1. Buy KUSD on DEX  │              │ 1. Mint KUSD at PSM │  │
│   │    for $0.98        │              │    for $1 USDC      │  │
│   │ 2. Redeem at PSM    │              │ 2. Sell on DEX      │  │
│   │    for $1 USDC      │              │    for $1.02        │  │
│   │ 3. Profit: ~2%      │              │ 3. Profit: ~2%      │  │
│   └─────────────────────┘              └─────────────────────┘  │
│   → KUSD price rises                   → KUSD price falls       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Multiple keepers compete** for these opportunities — first one wins. This competition ensures the peg is restored quickly.

## How Liquidations Work

When a vault becomes undercollateralized:

1. **Keeper detects** unsafe vault (collateral value < debt × liquidation ratio)
2. **Keeper calls** `Dog.bark()` to trigger liquidation
3. **Keeper earns** 100 KUSD + 2% of the debt as incentive
4. **Collateral auction** starts — keepers can bid to buy at discount

## Capital Requirements

| Mode | What You Need | Recommended Amount |
|------|---------------|-------------------|
| **Liquidations only** | KLC for gas | 0.1+ KLC |
| **Auction bidding** | KUSD in Vat | 10,000+ KUSD |
| **Peg arbitrage** | USDC + KUSD | 100+ USDC, 100+ KUSD |
| **Full mode** | All of the above | Start small, scale up |

## Configuration

All settings are in your `.env` file. Key options:

```env
# Operating Mode
MODE=full              # full, kick, or bid

# Peg Arbitrage (the main money-maker for new keepers)
ENABLE_PEG_ARB=true
MAX_ARB_AMOUNT=10000000          # Max USDC per trade (6 decimals = 10 USDC)
MIN_ARB_PROFIT_PERCENTAGE=0.5    # Only trade if profit > 0.5%
MAX_TRADE_PERCENT_OF_POOL=10     # Max 10% of pool liquidity per trade

# Liquidations & Auctions
MIN_PROFIT_PERCENTAGE=5          # Min profit % for auction bids
CHECK_INTERVAL=30000             # Check every 30 seconds
```

See [.env.example](./.env.example) for all options.

## Running the Keeper

### Development
```bash
npm run dev
```

### Production (PM2 recommended)
```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Auto-start on boot
```

### Monitoring
```bash
pm2 status
pm2 logs kusd-keeper
```

## Architecture

```
kusd-keeper/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── services/
│   │   ├── PegKeeperService.ts     # Peg arbitrage logic
│   │   ├── ContractService.ts      # Contract interactions
│   │   └── PriceService.ts         # Price feeds
│   ├── monitors/
│   │   ├── VaultMonitor.ts         # Vault health monitoring
│   │   └── AuctionMonitor.ts       # Auction monitoring
│   ├── executors/
│   │   ├── LiquidationExecutor.ts  # Triggers Dog.bark()
│   │   └── BiddingExecutor.ts      # Bids on auctions
│   └── config/
│       └── contracts.ts            # Contract addresses
└── .env                            # Your configuration
```

## Safety Features

- **Profit thresholds** — Only executes profitable trades
- **Pool size limits** — Won't trade more than X% of liquidity
- **Slippage protection** — Reverts if price moves too much
- **Cooldown periods** — Prevents rapid-fire trading
- **Emergency stop** — Halt all operations instantly
- **Comprehensive logging** — All actions logged for review

## FAQ

**Q: Can multiple people run this keeper?**
A: Yes! The system is designed for multiple competing keepers. First one to execute wins.

**Q: Do I need to deposit into the PSM pocket?**
A: No. The pocket is DAO-controlled. All keepers share the same PSM liquidity.

**Q: What if my transaction fails?**
A: Usually means another keeper beat you. This is normal and expected.

**Q: How much can I earn?**
A: Depends on market activity. More peg deviations and liquidations = more opportunities.

## Links

- [Detailed Setup Guide](./SETUP.md)
- [KUSD Documentation](https://docs.kalychain.io/kusd)
- [KalyChain Explorer](https://kalyscan.io)

## License

MIT

