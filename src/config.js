import 'dotenv/config';

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  token: requiredEnv('DISCORD_TOKEN'),
  clientId: requiredEnv('CLIENT_ID'),
  guildId: process.env.GUILD_ID || '',
  creatorId: process.env.CREATOR_ID || '',
  paymentoApiKey: requiredEnv('PAYMENTO_API_KEY'),
  paymentoSecret: requiredEnv('PAYMENTO_IPN_SECRET'),
  ipnPort: parseInt(process.env.IPN_PORT || '3456'),
  ipnHost: process.env.IPN_HOST || '0.0.0.0',
};
