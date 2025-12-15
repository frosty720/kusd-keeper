/**
 * Simple monitoring utility to check keeper health
 */
import { JsonRpcProvider, Wallet, formatEther, parseEther, formatUnits } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function checkHealth() {
  console.log('='.repeat(60));
  console.log('KUSD Keeper Health Check');
  console.log('='.repeat(60));

  try {
    // Check RPC connection
    const provider = new JsonRpcProvider(process.env.RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    console.log('✅ RPC Connection: OK');
    console.log(`   Current Block: ${blockNumber}`);

    // Check wallet
    const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);
    const balance = await provider.getBalance(wallet.address);
    console.log('✅ Wallet: OK');
    console.log(`   Address: ${wallet.address}`);
    console.log(`   Balance: ${formatEther(balance)} KLC`);

    if (balance < parseEther('0.01')) {
      console.log('⚠️  WARNING: Low balance! Please add more KLC for gas');
    }

    // Check contract addresses
    console.log('\n📋 Contract Configuration:');
    console.log(`   VAT: ${process.env.VAT_ADDRESS}`);
    console.log(`   DOG: ${process.env.DOG_ADDRESS}`);
    console.log(`   SPOTTER: ${process.env.SPOTTER_ADDRESS}`);

    // Check mode
    console.log('\n⚙️  Keeper Configuration:');
    console.log(`   Mode: ${process.env.MODE || 'full'}`);
    console.log(`   Check Interval: ${process.env.CHECK_INTERVAL || '30000'}ms`);
    console.log(`   Min Profit: ${process.env.MIN_PROFIT_PERCENTAGE || '5'}%`);
    console.log(`   Gas Price: ${formatUnits(process.env.GAS_PRICE || '21000000000', 'gwei')} Gwei`);

    console.log('\n✅ All checks passed!');
    console.log('='.repeat(60));
  } catch (error: any) {
    console.error('\n❌ Health check failed:', error.message);
    process.exit(1);
  }
}

checkHealth();

