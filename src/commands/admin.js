import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { grantAccess, getEntitlement, getTier, TIERS, TIER_PRICES } from '../lib/entitlements.js';
import { config } from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands for managing user access')
    .addUserOption((option) =>
      option.setName('user').setDescription('User to manage').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('action').setDescription('Action to perform')
        .addChoices(
          { name: 'Grant Premium', value: 'grant_premium' },
          { name: 'Grant Pro', value: 'grant_pro' },
          { name: 'Revoke Access', value: 'revoke' },
          { name: 'Check Status', value: 'check' }
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.user.id !== config.creatorId) {
      await interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const action = interaction.options.getString('action', true);

    const userId = targetUser.id;
    let currentTier = await getTier(userId);
    const entitlement = await getEntitlement(userId);

    switch (action) {
      case 'grant_premium':
        await grantAccess(userId, TIERS.PREMIUM, null);
        currentTier = TIERS.PREMIUM;
        break;
      case 'grant_pro':
        await grantAccess(userId, TIERS.PRO, null);
        currentTier = TIERS.PRO;
        break;
      case 'revoke':
        await grantAccess(userId, TIERS.FREE, null);
        currentTier = TIERS.FREE;
        break;
      case 'check':
        break;
    }

    const tierInfo = {
      [TIERS.FREE]: { label: 'Free', emoji: '🔓' },
      [TIERS.PREMIUM]: { label: 'Premium', emoji: '⭐' },
      [TIERS.PRO]: { label: 'Pro', emoji: '💎' },
    };
    const details = tierInfo[currentTier] || tierInfo[TIERS.FREE];

    const embed = new EmbedBuilder()
      .setTitle(`${details.emoji} User Access Updated`)
      .setColor(0x5865F2)
      .addFields(
        { name: 'User', value: `${targetUser.username} (${targetUser.id})`, inline: false },
        { name: 'Current Tier', value: details.label, inline: true }
      );

    if (entitlement?.purchased_at && currentTier !== TIERS.FREE) {
      embed.addFields({
        name: 'Purchased',
        value: new Date(entitlement.purchased_at).toLocaleDateString(),
        inline: true,
      });
    }

    const actionMessages = {
      grant_premium: '✅ Granted Premium access',
      grant_pro: '✅ Granted Pro access',
      revoke: '✅ Revoked access',
      check: 'ℹ️ Checked status',
    };

    embed.setDescription(actionMessages[action]);

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};