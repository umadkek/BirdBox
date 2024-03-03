const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
		.setName('echo')
		.setDescription('Sends the message to echo, either as a reply or not.')
        .addStringOption(option =>
			option
				.setName('message')
				.setDescription('The message to echo.')
                .setMaxLength(1024)
				.setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName('reply')
                .setDescription('Whether or not the bot should reply to your message.')
        ),
    async execute(interaction) {

        const message = interaction.options.getString('message');
        const reply = interaction.options.getBoolean('reply') ?? true;

        if (reply) {
            await interaction.reply(message);
        } else {
            await interaction.channel.send(message);
            await interaction.reply({ content: 'echoing...', ephemeral: true });
            await interaction.deleteReply(); // Janky but it's the best I can do, discord.js dosen't have an inbuilt interaction ender.
        }

    }
}