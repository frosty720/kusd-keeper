# Flap/Flop Auction Implementation

## ✅ Implementation Complete

All missing features from the original MakerDAO auction-keeper have been successfully implemented:

### **New Features Added**

1. **Surplus Auction Bidding (Flap)**
   - Monitor Flapper.Kick events for new surplus auctions
   - Calculate bidding opportunities based on sKLC price
   - Execute Flapper.tend() to bid on auctions
   - Burn sKLC tokens to buy surplus KUSD

2. **Debt Auction Bidding (Flop)**
   - Monitor Flopper.Kick events for new debt auctions
   - Calculate bidding opportunities based on sKLC price
   - Execute Flopper.dent() to bid on auctions
   - Receive newly minted sKLC tokens for KUSD payment

3. **Vat Balance Management**
   - Move KUSD between wallet and Vat internal balance
   - Ensure sufficient KUSD in Vat for bidding
   - Query balances across wallet and Vat

---

## 📁 Files Added

### **Monitors**
- `src/monitors/FlapMonitor.ts` - Monitors Flapper (surplus) auctions
- `src/monitors/FlopMonitor.ts` - Monitors Flopper (debt) auctions

### **Executors**
- `src/executors/FlapExecutor.ts` - Executes Flapper.tend() bids
- `src/executors/FlopExecutor.ts` - Executes Flopper.dent() bids

### **Utilities**
- `src/utils/vatBalance.ts` - Vat balance management utilities

### **ABIs**
- `abis/Flapper.json` - Flapper contract ABI
- `abis/Flopper.json` - Flopper contract ABI
- `abis/sKLC.json` - sKLC governance token ABI

---

## 📝 Files Modified

- `src/types/index.ts` - Added FlapAuction, FlopAuction, and related types
- `src/config/config.ts` - Added Flapper, Flopper, sKLC addresses
- `src/services/ContractService.ts` - Added Flapper/Flopper contract instances and methods
- `src/index.ts` - Integrated Flap/Flop monitors and executors
- `.env.example` - Added Flapper, Flopper, sKLC addresses
- `.env` - Added actual testnet contract addresses
- `README.md` - Updated documentation
- `IMPLEMENTATION_SUMMARY.md` - Added Phase 4, 5, 6

---

## 🔧 Contract Addresses (Testnet)

```env
FLAPPER_ADDRESS=0x2c8e1dcc5bcf756c42c67b2c5b775ca1ba6ac278
FLOPPER_ADDRESS=0x332c73dd2a6bfda26b5079d9639d7ef0d3377f5c
SKLC_ADDRESS=0x618e9fa8bb2efea686e685dee8bf931cd1a0e5bf
```

---

## 🎯 How It Works

### **Surplus Auctions (Flap)**

1. **Trigger**: When Vow has surplus KUSD (system profit)
2. **Keeper Action**: Bid sKLC tokens to buy KUSD
3. **Bidding**: `tend(id, lot, bid)` - bid MORE sKLC for same KUSD
4. **Result**: sKLC gets burned, keeper receives KUSD

**Capital Required**: sKLC tokens

### **Debt Auctions (Flop)**

1. **Trigger**: When Vow has bad debt (system loss)
2. **Keeper Action**: Bid KUSD to buy newly minted sKLC
3. **Bidding**: `dent(id, lot, bid)` - accept LESS sKLC for same KUSD
4. **Result**: Keeper receives sKLC, KUSD covers bad debt

**Capital Required**: KUSD in Vat

---

## 💰 Capital Requirements

The keeper now requires:

1. **KLC** - For gas fees (all transactions)
2. **KUSD in Vat** - For collateral auction bidding + Flop auction bidding
3. **sKLC** - For Flap auction bidding

---

## 🚀 Testing

### **Build**
```bash
cd kusd-keeper
npm run build
```

### **Run**
```bash
npm start
```

### **Expected Output**
```
✅ Configuration validated successfully
ContractService initialized
- Keeper: 0xaE51f2EfE70e57b994BE8F7f97C4dC824c51802a
- Vat: 0x0f41476b9fe5280e0f743474d93e01b1d0d7c0fa
- Dog: 0x186e740d2aabf58124c17ded3cbea92c0e38c9a1
- Flapper: 0x2c8e1dcc5bcf756c42c67b2c5b775ca1ba6ac278
- Flopper: 0x332c73dd2a6bfda26b5079d9639d7ef0d3377f5c
- sKLC: 0x618e9fa8bb2efea686e685dee8bf931cd1a0e5bf

VaultMonitor started
AuctionMonitor started
FlapMonitor started
FlopMonitor started

✅ KUSD Keeper started successfully
Mode: full
Monitoring vaults for liquidation opportunities...
Monitoring collateral auctions for bidding opportunities...
Monitoring surplus auctions for bidding opportunities...
Monitoring debt auctions for bidding opportunities...
```

---

## 🧪 Testing Scenarios

### **1. Test Flap Auction**
- Trigger: System accumulates surplus KUSD in Vow
- Action: Vow.flap() creates a surplus auction
- Expected: Keeper detects Flapper.Kick event and bids if profitable

### **2. Test Flop Auction**
- Trigger: System has bad debt in Vow
- Action: Vow.flop() creates a debt auction
- Expected: Keeper detects Flopper.Kick event and bids if profitable

### **3. Test Vat Balance Management**
- Action: Move KUSD between wallet and Vat
- Expected: Keeper can query and manage KUSD balances

---

## ✅ Feature Completeness

The KUSD keeper now implements **100% of critical features** from the original MakerDAO auction-keeper:

- ✅ Vault monitoring (Vat.Frob events)
- ✅ Liquidation triggering (Dog.bark)
- ✅ Collateral auction bidding (Clipper.take)
- ✅ Surplus auction bidding (Flapper.tend) **NEW**
- ✅ Debt auction bidding (Flopper.dent) **NEW**
- ✅ Vat balance management **NEW**
- ✅ Multi-collateral support
- ✅ Event monitoring
- ✅ Transaction management
- ✅ Comprehensive logging

**The keeper is now ready for comprehensive testnet testing before mainnet deployment!** 🎉

