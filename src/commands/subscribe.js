import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { createPayment } from '../lib/paymento.js';
import { getTier, TIERS, TIER_PRICES } from '../lib/entitlements.js';

const TIERS_OPTIONS = [
  {
    value: TIERS.PREMIUM,
    label: 'Premium',
    description: 'Selfbot, generator, and image rendering - monthly',
    price: TIER_PRICES[TIERS.PREMIUM].fiatAmount,
    period: '/month',
    emoji: '⭐',
  },
  {
    value: TIERS.PRO,
    label: 'Pro',
    description: 'Full access - one-time lifetime payment',
    price: TIER_PRICES[TIERS.PRO].fiatAmount,
    period: ' one-time',
    emoji: '💎',
  },
];

export default {
  data: new SlashCommandBuilder()
    .setName('subscribe')
    .setDescription('Purchase premium access with cryptocurrency'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const currentTier = await getTier(userId);

    if (currentTier !== TIERS.FREE) {
      const tierInfo = TIERS_OPTIONS.find((t) => t.value === currentTier);
      await interaction.reply({
        content: `You already have **${tierInfo?.label || currentTier}** access!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Unlock Premium Access')
      .setDescription('Select a tier below to purchase with cryptocurrency.')
      .setColor(0x5865F2)
      .addFields(
        TIERS_OPTIONS.map((tier) => ({
          name: `${tier.emoji} ${tier.label} - $${tier.price}${tier.period}`,
          value: tier.description,
          inline: true,
        }))
      )
      .setFooter({ text: 'Payments processed via Paymento.io' });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('subscribe:tier')
      .setPlaceholder('Select a tier to purchase')
      .addOptions(
        TIERS_OPTIONS.map((tier) => ({
          label: tier.label,
          description: `$${tier.price} USD - ${tier.description}`,
          value: tier.value,
        }))
      );

    const rows = [new ActionRowBuilder().addComponents(selectMenu)];

    await interaction.reply({
      embeds: [embed],
      components: rows,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export async function handleTierSelect(interaction) {
  const tier = interaction.values[0];
  const userId = interaction.user.id;

  const tierInfo = TIERS_OPTIONS.find((t) => t.value === tier);
  if (!tierInfo) {
    await interaction.update({
      content: 'Invalid tier selected.',
      components: [],
    });
    return;
  }

  await interaction.update({
    content: `Creating ${tierInfo.label} payment...`,
    components: [],
  });

  try {
    const returnUrl = process.env.PAYMENT_RETURN_URL || '';
    const result = await createPayment(userId, tier, returnUrl);

    const embed = new EmbedBuilder()
      .setTitle(`Complete ${tierInfo.label} Payment`)
      .setDescription('Click the link below to pay with cryptocurrency.')
      .setColor(0x5865F2)
      .addFields(
        { name: 'Amount', value: `$${tierInfo.price} USD`, inline: true },
        { name: 'Tier', value: tierInfo.label, inline: true }
      )
      .setURL(result.paymentUrl)
      .setFooter({ text: 'You will receive access once payment is confirmed.' });

    const payButton = new ButtonBuilder()
      .setURL(result.paymentUrl)
      .setLabel('Pay Now')
      .setStyle(ButtonStyle.Link);

    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(payButton)],
    });
  } catch (error) {
    console.error('[subscribe] Payment creation failed:', error);
    await interaction.editReply({
      content: `Failed to create payment: ${error.message}`,
      components: [],
    });
  }
}