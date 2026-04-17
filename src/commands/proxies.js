import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllResidentialProxies } from '../lib/proxyDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '..', '.tmp');

export default {
  data: new SlashCommandBuilder()
    .setName('proxies')
    .setDescription('Fetch and validate residential proxies from public lists.'),

  async execute(interaction) {
    // Defer reply since this may take time
    await interaction.deferReply();

    try {
      // Ensure temp directory exists
      await fs.mkdir(tempDir, { recursive: true });

      const validProxies = getAllResidentialProxies();

      if (validProxies.length === 0) {
        await interaction.editReply('❌ No residential proxies available in the database yet.');
        return;
      }

      // Create temporary file
      const filePath = path.join(tempDir, `residential_proxies_${Date.now()}.txt`);
      const content = validProxies.join('\n');
      await fs.writeFile(filePath, content, 'utf-8');

      // Create attachment and send
      const attachment = new AttachmentBuilder(filePath, {
        name: `residential_proxies_${validProxies.length}.txt`,
      });

      await interaction.editReply({
        content: `✅ Found and validated **${validProxies.length}** residential proxies.`,
        files: [attachment],
      });

      // Clean up temp file after a short delay
      setTimeout(async () => {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          console.error('Error cleaning up temp file:', error);
        }
      }, 5000);
    } catch (error) {
      console.error('Error in proxies command:', error);
      await interaction.editReply(
        '❌ An error occurred while loading residential proxies from the database.'
      );
    }
  },
};
