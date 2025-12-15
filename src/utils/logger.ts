import winston from 'winston';
import path from 'path';

const logDir = 'logs';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    // Liquidations log
    new winston.transports.File({
      filename: path.join(logDir, 'liquidations.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Auctions log
    new winston.transports.File({
      filename: path.join(logDir, 'auctions.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Helper functions for structured logging
export const logLiquidation = (data: {
  ilk: string;
  urn: string;
  collateral: string;
  debt: string;
  txHash?: string;
  success: boolean;
}) => {
  logger.info('Liquidation', {
    type: 'liquidation',
    ...data,
  });
};

export const logAuctionBid = (data: {
  auctionId: number;
  ilk: string;
  amount: string;
  price: string;
  profit: string;
  txHash?: string;
  success: boolean;
}) => {
  logger.info('Auction Bid', {
    type: 'auction_bid',
    ...data,
  });
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    ...context,
  });
};

export const logVaultCheck = (data: {
  totalVaults: number;
  unsafeVaults: number;
  duration: number;
}) => {
  logger.debug('Vault check completed', {
    type: 'vault_check',
    ...data,
  });
};

export const logAuctionCheck = (data: {
  activeAuctions: number;
  profitableAuctions: number;
  duration: number;
}) => {
  logger.debug('Auction check completed', {
    type: 'auction_check',
    ...data,
  });
};

export default logger;

