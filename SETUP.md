# KUSD Keeper Setup Guide

Complete guide to set up and run the KUSD Keeper on KalyChain.

## Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- A wallet with KLC for gas fees
- Access to KalyChain RPC

## Quick Start

### 1. Install Dependencies

```bash
cd kusd-keeper
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your settings
nano .env
```

**Required Configuration:**

```env
# Your keeper wallet private key (KEEP THIS SECRET!)
PRIVATE_KEY=0x...

# KalyChain RPC endpoint
RPC_URL=https://testnetrpc.kalychain.io/rpc

# Contract addresses (already configured for testnet)
VAT_ADDRESS=0x0f41476b9fe5280e0f743474d93e01b1d0d7c0fa
DOG_ADDRESS=0x186e740d2aabf58124c17ded3cbea92c0e38c9a1
```

### 3. Test Configuration

```bash
npm run monitor
```

This will check:
- ✅ RPC connection
- ✅ Wallet balance
- ✅ Contract addresses
- ✅ Configuration

### 4. Run in Development

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run build
npm start
```

## Deployment with PM2

### Install PM2

```bash
npm install -g pm2
```

### Start Keeper

```bash
# Build the project
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Monitor Keeper

```bash
# Check status
pm2 status

# View logs
pm2 logs kusd-keeper

# View real-time logs
pm2 logs kusd-keeper --lines 100

# Monitor resources
pm2 monit
```

### Manage Keeper

```bash
# Restart
pm2 restart kusd-keeper

# Stop
pm2 stop kusd-keeper

# Delete
pm2 delete kusd-keeper
```

## Configuration Options

### Keeper Modes

**Full Mode (Default)** - Monitors vaults AND bids on auctions:
```env
MODE=full
```

**Kick Only** - Only triggers liquidations:
```env
MODE=kick
```

**Bid Only** - Only bids on existing auctions:
```env
MODE=bid
```

### Performance Tuning

**Check Interval** - How often to check for opportunities (milliseconds):
```env
CHECK_INTERVAL=30000  # 30 seconds
```

**Min Profit** - Minimum profit percentage to bid:
```env
MIN_PROFIT_PERCENTAGE=5  # 5%
```

**Gas Settings** - KalyChain specific:
```env
GAS_LIMIT=3000000
GAS_PRICE=21000000000  # 21 Gwei
MAX_GAS_PRICE=50000000000  # 50 Gwei max
```

### Safety Features

**Emergency Stop** - Halt all operations:
```env
EMERGENCY_STOP=true
```

**Max Collateral** - Maximum USD value per auction:
```env
MAX_COLLATERAL_PER_AUCTION=1000000
```

## Capital Requirements

### For Liquidation Triggering (Kick Mode)
- **Only needs KLC for gas**
- Recommended: 0.1 KLC minimum
- Each liquidation costs ~0.001 KLC

### For Auction Bidding (Bid Mode)
- **Needs KUSD in Vat to bid**
- Recommended: 10,000 - 50,000 KUSD
- More capital = more opportunities

## Monitoring & Logs

### Log Files

Logs are stored in `logs/` directory:
- `combined.log` - All logs
- `error.log` - Errors only
- `liquidations.log` - Liquidation events
- `auctions.log` - Auction events

### Health Check

```bash
npm run monitor
```

### View Live Logs

```bash
# All logs
tail -f logs/combined.log

# Liquidations only
tail -f logs/liquidations.log

# Errors only
tail -f logs/error.log
```

## Troubleshooting

### Keeper not detecting vaults

**Check RPC connection:**
```bash
curl -X POST https://testnetrpc.kalychain.io/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

**Verify contract addresses:**
```bash
npm run monitor
```

### Liquidations not executing

**Check wallet balance:**
- Need at least 0.01 KLC for gas

**Check emergency stop:**
```env
EMERGENCY_STOP=false
```

**Check logs:**
```bash
pm2 logs kusd-keeper --err
```

### High gas costs

**Adjust gas price:**
```env
GAS_PRICE=15000000000  # Lower to 15 Gwei
```

**Increase check interval:**
```env
CHECK_INTERVAL=60000  # Check every minute instead of 30s
```

## Security Best Practices

1. **Never commit `.env` file**
2. **Use a dedicated keeper wallet**
3. **Start with small amounts on testnet**
4. **Monitor logs regularly**
5. **Set up alerts for errors**
6. **Keep private key secure**

## Next Steps

1. ✅ Install and configure
2. ✅ Test on testnet
3. ✅ Monitor for 24 hours
4. ✅ Adjust parameters
5. ✅ Deploy to mainnet (when ready)

## Support

For issues or questions:
- Check logs: `pm2 logs kusd-keeper`
- Review configuration: `npm run monitor`
- Check GitHub issues

