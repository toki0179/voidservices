import { randomInt } from 'node:crypto';
import { SlashCommandBuilder } from 'discord.js';
import { renderImage } from '../lib/workerPool.js';

const fallbackFirstNames = ['Nova', 'Echo', 'Rift', 'Pixel', 'Luna', 'Cipher', 'Moss', 'Ash'];
const fallbackLastNames = ['Runner', 'Bloom', 'Static', 'Vector', 'Orbit', 'Flare', 'Signal', 'Drift'];
const fallbackAvatars = [
  'https://cdn.discordapp.com/embed/avatars/0.png',
  'https://cdn.discordapp.com/embed/avatars/1.png',
  'https://cdn.discordapp.com/embed/avatars/2.png',
  'https://cdn.discordapp.com/embed/avatars/3.png',
  'https://cdn.discordapp.com/embed/avatars/4.png',
  'https://cdn.discordapp.com/embed/avatars/5.png',
];

function pickRandom(values) {
  return values[randomInt(values.length)];
}

function buildFallbackIdentity() {
  const firstName = pickRandom(fallbackFirstNames);
  const lastName = pickRandom(fallbackLastNames);
  const name = `${firstName}${lastName}`;
  const avatarUrl = pickRandom(fallbackAvatars);

  return { name, avatarUrl };
}

function getRandomCachedUser(interaction) {
  const cachedUsers = [...interaction.client.users.cache.values()].filter((user) => user.id !== interaction.user.id);

  if (cachedUsers.length === 0) {
    return buildFallbackIdentity();
  }

  return cachedUsers[Math.floor(Math.random() * cachedUsers.length)];
}

async function resolveResponseIdentity(interaction) {
  const responseUserId = interaction.options.getString('response-user-id');

  if (responseUserId) {
    try {
      const user = await interaction.client.users.fetch(responseUserId);

      if (user.id !== interaction.user.id) {
        return user;
      }
    } catch {
      // Fall through to the randomized identity when the ID is invalid or unavailable.
    }
  }

  return getRandomCachedUser(interaction);
}

export default {
  data: new SlashCommandBuilder()
    .setName('boost')
    .setDescription('Create a Nitro proof card with a chosen user ID')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Text shown after the fake Nitro link')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('response-user-id')
        .setDescription('Discord user ID to use for the response identity')
        .setRequired(true),
    ),

  async execute(interaction) {
    const displayName = interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
    const message = interaction.options.getString('message', true);
    const secondAuthor = await resolveResponseIdentity(interaction);
    const secondAuthorName = secondAuthor.globalName ?? secondAuthor.username ?? secondAuthor.name;
    const secondAuthorAvatarUrl = secondAuthor.displayAvatarURL
      ? secondAuthor.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true })
      : secondAuthor.avatarUrl;

    const image = await renderImage('nitro', {
      firstAuthorName: displayName,
      firstAuthorAvatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true }),
      secondAuthorName,
      secondAuthorAvatarUrl,
      responseText: message.trim(),
    });

    await interaction.reply({
      content: 'Generated Nitro proof image.',
      files: [image],
    });
  },
};