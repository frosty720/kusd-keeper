# KUSD Keeper

TypeScript-based auction keeper for the KUSD stablecoin system on KalyChain.

## Overview

The KUSD Keeper monitors vaults and participates in liquidation auctions to maintain the health of the KUSD stablecoin system. **Both liquidation triggering AND auction bidding are CRITICAL for the KUSD system to function correctly.**

### Features

- **Vault Monitoring**: Tracks all vaults and detects unsafe positions
- **Liquidation Triggering**: Calls `Dog.bark()` to liquidate unsafe vaults (earns 100 KUSD + 2% of debt)
- **Collateral Auction Participation**: Bids on Clipper auctions when profitable (earns arbitrage profit)
- **Surplus Auction Participation**: Bids on Flapper auctions (buys KUSD with sKLC)
- **Debt Auction Participation**: Bids on Flopper auctions (accepts newly minted sKLC for KUSD)
- **Price Oracle Integration**: Fetches real-time prices from KUSD oracles
- **Multi-Collateral Support**: Handles WBTC, WETH, USDT, USDC, and DAI
- **Vat Balance Management**: Automatically manages KUSD balance between wallet and Vat
- **Gas Optimization**: KalyChain-specific gas configuration
- **Safety Features**: Profit thresholds, emergency stop, comprehensive monitoring
- **Three Modes**: Full (liquidate + bid), Kick-only, or Bid-only

## Architecture

```
kusd-keeper/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/
│   │   ├── config.ts         # Configuration management
│   │   └── contracts.ts      # Contract addresses and ABIs
│   ├── monitors/
│   │   ├── VaultMonitor.ts   # Monitors vaults for liquidations
│   │   ├── AuctionMonitor.ts # Monitors collateral auctions
│   │   ├── FlapMonitor.ts    # Monitors surplus auctions
│   │   └── FlopMonitor.ts    # Monitors debt auctions
│   ├── executors/
│   │   ├── LiquidationExecutor.ts  # Executes Dog.bark()
│   │   ├── BiddingExecutor.ts      # Executes Clipper.take()
│   │   ├── FlapExecutor.ts         # Executes Flapper.tend()
│   │   └── FlopExecutor.ts         # Executes Flopper.dent()
│   ├── services/
│   │   ├── ContractService.ts      # Contract interaction layer
│   │   └── PriceService.ts         # Price feed integration
│   ├── utils/
│   │   ├── logger.ts         # Winston logger
│   │   ├── calculations.ts   # Math utilities
│   │   ├── vatBalance.ts     # Vat balance management
│   │   └── monitor.ts        # Health monitoring
│   └── types/
│       └── index.ts          # TypeScript types
└── abis/                     # Contract ABIs
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## Configuration

Edit `.env` file:

```env
# Required
PRIVATE_KEY=your_private_key_here
RPC_URL=https://testnetrpc.kalychain.io/rpc

# Optional
MODE=full  # full, kick, or bid
MIN_PROFIT_PERCENTAGE=5
CHECK_INTERVAL=30000
```

## Usage

### Run Full Keeper (Liquidation + Bidding)
```bash
npm run dev
```

### Run Liquidation Only
```bash
npm run kick-only
```

### Run Bidding Only
```bash
npm run bid-only
```

### Build for Production
```bash
npm run build
npm start
```

### Monitor Health
```bash
npm run monitor
```

## How It Works

### 1. Vault Monitoring
- Listens to `Vat.frob` events to track all vaults
- Loads historical vaults from past 100k blocks
- Calculates collateralization ratios in real-time
- Detects unsafe vaults (collateral < debt * liquidation ratio)

### 2. Liquidation Triggering
- Calls `Dog.bark(ilk, urn, keeper)` for unsafe vaults
- **Earns incentive: 100 KUSD + 2% of debt being liquidated**
- Ensures room in Dog.Hole and ilk.hole before liquidating
- Starts Dutch auction in Clipper contract

### 3. Collateral Auction Participation (Clipper)
- Monitors `Dog.Bark` events for new auctions
- Tracks active auctions and calculates current prices
- Fetches market prices from KUSD oracles
- Calculates profitability (market price vs auction price)
- Calls `Clipper.take(id, amt, max, who, data)` to bid
- Only bids when profit > MIN_PROFIT_PERCENTAGE
- **Earns arbitrage profit from buying below market price**

### 4. Surplus Auction Participation (Flapper)
- Monitors `Flapper.Kick` events for new surplus auctions
- Tracks active Flap auctions
- Calculates minimum bid increase (beg parameter)
- Calls `Flapper.tend(id, lot, bid)` to bid MORE sKLC for same KUSD
- **Buys KUSD with sKLC tokens (sKLC gets burned)**
- Requires sKLC balance in keeper wallet

### 5. Debt Auction Participation (Flopper)
- Monitors `Flopper.Kick` events for new debt auctions
- Tracks active Flop auctions
- Calculates maximum lot decrease (beg parameter)
- Calls `Flopper.dent(id, lot, bid)` to accept LESS sKLC for same KUSD
- **Accepts newly minted sKLC in exchange for KUSD**
- Requires KUSD balance in Vat

### 6. Price Oracle Integration
- Connects to deployed KUSD oracle contracts
- Fetches real-time prices for all collateral types
- Caches prices for 30 seconds to reduce RPC calls
- Uses prices to calculate auction profitability

## Safety Features

- **Profit Threshold**: Only bids when profitable
- **Gas Price Limits**: Won't execute if gas too high
- **Emergency Stop**: Can halt operations via config
- **Max Collateral Limits**: Caps exposure per auction
- **Comprehensive Logging**: All actions logged

## Deployment

### PM2 (Recommended)
```bash
npm run build
pm2 start dist/index.js --name kusd-keeper
pm2 save
```

### Docker
```bash
docker build -t kusd-keeper .
docker run -d --env-file .env kusd-keeper
```

## Monitoring

Check keeper status:
```bash
pm2 status
pm2 logs kusd-keeper
```

## Capital Requirements

### For Liquidation Triggering (Kick Mode)
- **Only needs KLC for gas**
- Recommended: 0.1 KLC minimum
- Each liquidation costs ~0.001 KLC (~62,374 gas at 21 Gwei)
- **Earns: 100 KUSD + 2% of debt per liquidation**

### For Auction Bidding (Bid Mode)
- **Needs KUSD in Vat to bid**
- Recommended: 10,000 - 50,000 KUSD to start
- More capital = more opportunities
- **Earns: Arbitrage profit from buying below market**

### For Full Mode (Recommended)
- Needs both KLC for gas AND KUSD in Vat
- Earns from BOTH liquidation incentives AND auction profits
- Most profitable and helps the system the most

## Troubleshooting

### Keeper not detecting vaults
- Check RPC connection
- Verify contract addresses
- Ensure wallet has KLC for gas

### Bids not executing
- Check KUSD balance in Vat
- Verify MIN_PROFIT_PERCENTAGE is reasonable
- Check gas price limits

## License

MIT

