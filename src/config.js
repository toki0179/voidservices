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
};
