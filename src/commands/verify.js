import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getEntitlement, getTier, TIERS, TIER_PRICES } from '../lib/entitlements.js';

const TIER_INFO = {
  [TIERS.FREE]: { label: 'Free', emoji: '🔓', features: 'Basic commands only' },
  [TIERS.PREMIUM]: { label: 'Premium', emoji: '⭐', features: 'Selfbot, Generator, Image Rendering' },
  [TIERS.PRO]: { label: 'Pro', emoji: '💎', features: 'Full access + priority support' },
};

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Check your current subscription status'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const tier = await getTier(userId);
    const entitlement = await getEntitlement(userId);
    const tierDetails = TIER_INFO[tier] || TIER_INFO[TIERS.FREE];

    const embed = new EmbedBuilder()
      .setTitle(`${tierDetails.emoji} Subscription Status`)
      .setColor(0x5865F2)
      .addFields(
        { name: 'Tier', value: tierDetails.label, inline: true },
        { name: 'Status', value: tier === TIERS.FREE ? 'Active' : 'Active', inline: true }
      );

    if (entitlement?.purchased_at) {
      embed.addFields({
        name: 'Purchased',
        value: new Date(entitlement.purchased_at).toLocaleDateString(),
        inline: true,
      });
    }

    if (entitlement?.expires_at) {
      embed.addFields({
        name: 'Expires',
        value: new Date(entitlement.expires_at).toLocaleDateString(),
        inline: true,
      });
    }

    embed.addFields({
      name: 'Features',
      value: tierDetails.features,
    });

    if (tier === TIERS.FREE) {
      embed.setDescription('Run `/subscribe` to unlock premium features!');
    } else {
      embed.setDescription('Thank you for supporting V0iD!');
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};