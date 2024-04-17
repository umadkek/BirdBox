const { randomMsg } = require("../../utils/scripts/util_scripts.js");
const { extras, guesses } = require("../../utils/json/wordle.json");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder} = require("discord.js");

let wordleSessions = {};

module.exports = { //MARK: command data
    data: new SlashCommandBuilder()
		.setName('wordle')
		.setDescription('Play the iconic daily game anytime on BirdBox!')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new Wordle game.')
                .addStringOption(option =>
                    option
                        .setName('code')
                        .setDescription('Use a code from a friend to start the game with a specific word.')
                )
                .addStringOption(option =>
                    option
                        .setName('guess')
                        .setDescription('Make your first guess without wasting time running two commands.')
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('solutions')
                        .setDescription('Allow for every valid guess to be a possible answer, rather than just the curated list of solutions.')
                        .addChoices(
                            { name: `curated`, value: "wordle" },
                            { name: `all`, value: "wordle all" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('guess')
                .setDescription('Make a guess on an active Wordle game.')
                .addStringOption(option =>
                    option
                        .setName('guess')
                        .setDescription('The word you want to guess.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View high scores across all BirdBox users.')
                .addStringOption(option =>
                    option
                        .setName('statistic')
                        .setDescription('Change what statistic you want to view.')
                        .setRequired(true)
                        .addChoices(
                            { name: `average guesses`, value: "average guesses" },
                            { name: `win percentage`, value: "win percentage" },
                            { name: `best streak`, value: "best streak" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('code')
                .setDescription('Get the code for a word to share it with others.')
                .addStringOption(option =>
                    option
                        .setName('word')
                        .setDescription('The word you want to encrypt.')
                        .setRequired(true)
                )
        ),
    async autocomplete(interaction) { //MARK: autocomplete
        const focusedOption = interaction.options.getFocused(true)
        const guessedWord = focusedOption.value.toLowerCase()
        
        //have to access the solution in a different place based on subcommand
        const solutionWordIfGuess = wordleSessions?.[interaction.member.id]?.solution
        const solutionCodeIfStart = interaction?.options?._hoistedOptions?.filter(opt => opt?.name == 'code')?.[0]?.value //this is weird but it works
        const solutionWordIfStart = decryptWordCode(solutionCodeIfStart)
        
        const wordInvalid = !guesses.includes(guessedWord) && !extras.includes(guessedWord)
        const wordCorrect = (guessedWord == solutionWordIfGuess || guessedWord == solutionWordIfStart)

        let responseText
        if (guessedWord && wordInvalid && !wordCorrect) {
            responseText = `${guessedWord} is definitely not a word bruh, try something else`
        } else if (guessedWord) {
            responseText = guessedWord
        } else {
            responseText = `well hurry up and guess, i aint got all day`
        }

        await interaction.respond([{name: responseText, value: responseText}])

    },
    async execute(interaction, {embedColors, client, db}) {
        switch (interaction.options.getSubcommand()) { // Switch to handle different subcommands.
            case 'start': { //MARK: start subcommand
                const code = interaction.options?.getString('code')
                const guess = interaction.options?.getString('guess')?.toLowerCase()
                const moreSolutions = interaction.options?.getString('solutions') ?? 'wordle'

                if (code?.length > 10) {
                    return interaction.reply({content: `what kinda code is that, use the code subcommand to get a valid one lol`, ephemeral: true})
                }

                const solutionWord = code ? decryptWordCode(code) : randomMsg(moreSolutions)
                const encryptedSolution = encryptWordCode(solutionWord)

                //note: autocomplete does NOT make this redundant if you're quick about it
                const guessInvalid = !guesses.includes(guess) && !extras.includes(guess)
                const guessCorrect = (guess == solutionWord)

                if (guess && guessInvalid && !guessCorrect) {
                    return interaction.reply({content: `bruh "${guess}" is definitely not a word, try again`, ephemeral: true})
                }

                let numberOfGuesses = 0

                const gameFields = [
                    {boxes: ["⬛", "⬛", "⬛", "⬛", "⬛"], word: ""},
                    {boxes: ["⬛", "⬛", "⬛", "⬛", "⬛"], word: ""},
                    {boxes: ["⬛", "⬛", "⬛", "⬛", "⬛"], word: ""},
                    {boxes: ["⬛", "⬛", "⬛", "⬛", "⬛"], word: ""},
                    {boxes: ["⬛", "⬛", "⬛", "⬛", "⬛"], word: ""},
                    {boxes: ["⬛", "⬛", "⬛", "⬛", "⬛"], word: ""}
                ]

                if (guess) {
                    gameFields[0] = {boxes: getLetterColors(solutionWord, guess), word: guess.toUpperCase()};
                    numberOfGuesses++;
                }

                const wordleEmbed = createWordleEmbed(embedColors, numberOfGuesses, encryptedSolution, gameFields)

                const usedLettersButton = new ButtonBuilder()
                    .setCustomId("wordle-used-letters")
                    .setLabel("See Used Letters")
                    .setStyle(ButtonStyle.Secondary)
        
                const wordleActionRow = new ActionRowBuilder()
                    .addComponents(usedLettersButton)
                
                const response = await interaction.reply({embeds: [wordleEmbed], components: [wordleActionRow]})

                const buttonCollector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 });

                buttonCollector.on('collect', async i => {
                    const keyboardString = handleUsedLettersDisplay(gameFields)
            
                    i.reply({content: keyboardString, ephemeral: true})
                })
            
                buttonCollector.on('end', async () => {
                    //disable the button
                    wordleActionRow.components[0].setDisabled(true)
                    response.edit({ components: [wordleActionRow] })
                })

                wordleSessions[interaction.member.id] = {
                    solution: solutionWord, 
                    guesses: numberOfGuesses,
                    fields: gameFields,
                    usedCode: !!code //this is somehow the recommended way to convert to a bool
                }

                break;
            }
            case 'guess': {//MARK: guess subcommand
                const currentSession = wordleSessions[interaction.member.id]

                if (!currentSession) {
                    return interaction.reply({content: `how bout you start a game before trying to guess lol`, ephemeral: true})
                }

                const guess = interaction.options?.getString('guess').toLowerCase()

                const solutionWord = currentSession.solution
                const gameFields = currentSession.fields
                const numberOfGuesses = currentSession.guesses + 1

                //note: autocomplete does NOT make this redundant if you're quick about it
                const guessInvalid = !guesses.includes(guess) && !extras.includes(guess)
                const guessCorrect = (guess == solutionWord)

                if (guessInvalid && !guessCorrect) {
                    return interaction.reply({content: `bruh ${guess} is definitely not a word, try again`, ephemeral: true})
                }

                const letterColors = getLetterColors(solutionWord, guess)

                gameFields[numberOfGuesses - 1] = {boxes: letterColors, word: guess.toUpperCase()};

                const encryptedSolution = encryptWordCode(solutionWord)

                const wordleEmbed = createWordleEmbed(embedColors, numberOfGuesses, encryptedSolution, gameFields)

                //win/loss detection
                const userHasWon = letterColors.every(char => char === "🟩")
                const userHasLost = numberOfGuesses == 6

                if (userHasWon || userHasLost) { //MARK: game ended
                    let updatedGameFields = []
                    for (let i = 0; i < gameFields.length; i++) {
                        if (!gameFields[i].boxes.every(char => char === "⬛")) {
                            updatedGameFields[i] = gameFields[i]
                        }
                    }

                    const copyResultsButton = new ButtonBuilder()
                        .setCustomId("wordle-copy-results")
                        .setLabel("Copy Results")
                        .setStyle(ButtonStyle.Success)
                    
                    const wordleActionRow = new ActionRowBuilder()
                        .addComponents(copyResultsButton)

                    const response = await interaction.reply({embeds: [wordleEmbed], components: [wordleActionRow]})

                    const buttonCollector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 });

                    buttonCollector.on('collect', async i => {
                        const resultsString = `\`\`\`\nBirdBox Wordle \nID ${encryptedSolution}\n${updatedGameFields.map(field => field?.boxes.join("")).join("\n")}\n\`\`\``

                        const resultsEmbed = new EmbedBuilder()
                            .setTitle("Results")
                            .setDescription(`Copy in the top right corner! \n${resultsString}`)

                        i.reply({embeds: [resultsEmbed], ephemeral: true})
                    })

                    buttonCollector.on('end', async () => {
                        //disable the button
                        wordleActionRow.components[0].setDisabled(true)
                        response.edit({ components: [wordleActionRow] })
                    })

                    wordleSessions[interaction.member.id] = undefined
                    
                    //updating statistics now, but only if there was no word code (to avoid cheating)
                    if (!currentSession.usedCode) { //MARK: update statistics
                        let userStats = await db.get(`wordle_stats.random_6letter.${interaction.member.id}`);

                        if (!userStats) userStats = {
                            guess_stats: {
                                "1": 0, "2": 0, "3": 0,
                                "4": 0, "5": 0, "6": 0,
                                "loss": 0
                            },
                            current_streak: 0,
                            best_streak: 0
                        };

                        if (userHasWon) {
                            userStats.guess_stats[numberOfGuesses]++;
                            userStats.current_streak++;

                            if (userStats.current_streak > userStats.best_streak) {
                                userStats.best_streak = userStats.current_streak;
                            }
                        } else if (userHasLost) {
                            userStats.guess_stats["loss"]++;
                            userStats.current_streak = 0;
                        }
    
                        await db.set(`wordle_stats.random_6letter.${interaction.member.id}`, userStats);
                    }

                } else { //MARK: game continuing

                    const usedLettersButton = new ButtonBuilder()
                        .setCustomId("wordle-used-letters")
                        .setLabel("See Used Letters")
                        .setStyle(ButtonStyle.Secondary)
            
                    const wordleActionRow = new ActionRowBuilder()
                        .addComponents(usedLettersButton)
                    
                    const response = await interaction.reply({embeds: [wordleEmbed], components: [wordleActionRow]})

                    const buttonCollector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                    buttonCollector.on('collect', async i => {
                        const keyboardString = handleUsedLettersDisplay(gameFields)
                
                        i.reply({content: keyboardString, ephemeral: true})
                    })
                
                    buttonCollector.on('end', async () => {
                        //disable the button
                        wordleActionRow.components[0].setDisabled(true)
                        response.edit({ components: [wordleActionRow] })
                    })

                    wordleSessions[interaction.member.id] = {
                        solution: solutionWord, 
                        guesses: numberOfGuesses,
                        fields: gameFields,
                        usedCode: currentSession.usedCode
                    }
                }

                break;
            }
            case 'leaderboard': { //MARK: leaderboard subcommand
                const statisticChoice = interaction.options?.getString('statistic')

                const leaderboardEmbed = new EmbedBuilder()
                .setColor(embedColors.purple)
                .setFooter({ text: "look at all these amateurs"})

                const gameStats = await db.get(`wordle_stats.random_6letter`)

                if (!gameStats) {
                    leaderboardEmbed.setTitle("Wordle Game")
                    leaderboardEmbed.setDescription("huh, looks like there's nothing here");
                    await interaction.reply({ embeds: [leaderboardEmbed] });
                    return;
                }

                const statisticDisplays = {
                    'average guesses': async () => { //MARK: average guesses statistic
                        leaderboardEmbed.setTitle("Wordle Game - Average Guesses per Game")
        
                        let averageLeaderboardArray = [];
                        let averageLeaderboardText = "";
        
                        for (const userId of Object.keys(gameStats)) {
                            const userInfo = await client.users.fetch(userId)
                            const userName = userInfo.username
        
                            gameStats[userId].name = userName

                            const guessStats = gameStats[userId].guess_stats
                            const numberOfGames = guessStats[1] + guessStats[2] + guessStats[3] + guessStats[4] + guessStats[5] + guessStats[6]

                            let numberOfGuesses = 0
                            for (const [key, val] of Object.entries(guessStats)) {

                                if (key != "loss") {
                                    //multiply the number of instances where it took x many guesses
                                    //by x to get the number of guesses, then add it to running total
                                    numberOfGuesses += (val * key)
                                }
                            }

                            const averageGuessesPerGame = (numberOfGuesses / numberOfGames).toFixed(2)

                            gameStats[userId].avg = averageGuessesPerGame

                            averageLeaderboardArray.push(gameStats[userId])
                        }
        
                        //sort by lowest average (kinda confusing)
                        averageLeaderboardArray.sort((a, b) => {
                            if (a.avg < b.avg) return -1
                            else if (a.avg > a.avg) return 1
                            else return 0 
                        });
        
                        for (user of averageLeaderboardArray) {
                            averageLeaderboardText += `${user.name}: **${user.avg} guesses**\n`
                        }
        
                        leaderboardEmbed.setDescription(averageLeaderboardText);
                    },
                    'win percentage': async () => { //MARK: win percentage statistic
                        leaderboardEmbed.setTitle("Wordle Game - Highest Win Percentage")

                        let percentLeaderboardArray = [];
                        let percentLeaderboardText = "";

                        for (const userId of Object.keys(gameStats)) {
                            const userInfo = await client.users.fetch(userId)
                            const userName = userInfo.username

                            const guessStats = gameStats[userId].guess_stats

                            const numberOfWonGames = guessStats[1] + guessStats[2] + guessStats[3] + guessStats[4] + guessStats[5] + guessStats[6]
                            const numberOfGames = numberOfWonGames + guessStats["loss"]
                            const winPercentage = Number(numberOfWonGames / numberOfGames).toLocaleString(undefined,{style: 'percent', minimumFractionDigits:2});
        
                            gameStats[userId].name = userName
                            gameStats[userId].win_percent = winPercentage
                            percentLeaderboardArray.push(gameStats[userId])
                        }

                        //sort by most points (kinda confusing)
                        percentLeaderboardArray.sort((a, b) => {
                            if (a.win_percent > b.win_percent) return -1
                            else if (a.win_percent < a.win_percent) return 1
                            else return 0 
                        });

                        for (user of percentLeaderboardArray) {
                            percentLeaderboardText += `${user.name}: **${user.win_percent} of games**\n`
                        }

                        leaderboardEmbed.setDescription(percentLeaderboardText);
                    },
                    'best streak': async () => { //MARK: best streak statistic
                        leaderboardEmbed.setTitle("Wordle Game - Longest Win Streak")

                        let streakLeaderboardArray = [];
                        let streakLeaderboardText = "";

                        for (const userId of Object.keys(gameStats)) {
                            const userInfo = await client.users.fetch(userId)
                            const userName = userInfo.username
        
                            gameStats[userId].name = userName
                            streakLeaderboardArray.push(gameStats[userId])
                        }

                        //sort by most points (kinda confusing)
                        streakLeaderboardArray.sort((a, b) => {
                            if (a.best_streak > b.best_streak) return -1
                            else if (a.best_streak < a.best_streak) return 1
                            else return 0 
                        });

                        for (user of streakLeaderboardArray) {
                            if (user.best_streak == 1) {
                                streakLeaderboardText += `${user.name}: **${user.best_streak} game**\n`
                            } else {
                                streakLeaderboardText += `${user.name}: **${user.best_streak} games**\n`
                            }
                            
                        }

                        leaderboardEmbed.setDescription(streakLeaderboardText);
                    }
                }

                //MARK: handling statistic selector
                await statisticDisplays[statisticChoice]()

                const statSelector = new StringSelectMenuBuilder()
                    .setCustomId('statSelector')
                    .setPlaceholder('Select statistic...')
                    .addOptions([
                        new StringSelectMenuOptionBuilder()
                            .setLabel("points")
                            .setValue("points"),
                        new StringSelectMenuOptionBuilder()
                            .setLabel("win percentage")
                            .setValue("win percentage"),
                        new StringSelectMenuOptionBuilder()
                            .setLabel("best streak")
                            .setValue("best streak")
                    ])

                const selectorRow = new ActionRowBuilder()
                    .addComponents(statSelector)

                const response = await interaction.reply({ embeds: [leaderboardEmbed], components: [selectorRow] });

                const menuCollector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

                menuCollector.on('collect', async i => {
                    const newStatisticChoice = i.values[0]

                    await statisticDisplays[newStatisticChoice]()

                    await response.edit({ embeds: [leaderboardEmbed] });

                    await i.deferUpdate();
                })

                menuCollector.on('end', async i => {
                    //disable the selector
                    selectorRow.components[0].setDisabled(true)
                    response.edit({ components: [selectorRow] })
                })

                break;
            }
            case 'code': { //MARK: code subcommand
                    const word = interaction.options?.getString('word')

                    if (word.length != 5) return await interaction.reply({content: `bruh we need a 5 letter word for wordle`, ephemeral: true})

                    const encryptedCode = encryptWordCode(word.toLowerCase())

                    const responseText = `The Wordle code for ${word} is \`${encryptedCode}\`. \nUse \`/wordle code\` to play your custom game!`
                    await interaction.reply({content: responseText, ephemeral: true})
                break;
            }
        }
    }
}

const shuffledAlphabet = "rlzwvefuognicapqmytbjksxdh".split("")

//MARK: code encryption functions
function encryptWordCode(word) {
    const splitWord = word.split("")

    let hexWord = ""
    for (let letter of splitWord) {
        const letterCode = shuffledAlphabet.indexOf(letter)
        const encryptedLetter = letterCode.toString(16)
        const paddedEncryptedLetter = ("0" + encryptedLetter).slice(-2)
        hexWord += paddedEncryptedLetter
    }

    return hexWord
}

function decryptWordCode(code) {
    if (!code) return;

    const hexCode = code.match(/(.{2})/g)

    let decryptedString = ""
    for (let letter of hexCode) {
        decryptedString += shuffledAlphabet[parseInt(letter, 16)]
    }

    return decryptedString
}

//MARK: get letter colors
function getLetterColors(solutionWord, guessedWord) {
    //behavior sourced from https://www.reddit.com/r/wordle/comments/ry49ne/illustration_of_what_happens_when_your_guess_has/
    //more or less modified the source code from https://github.com/Hugo0/wordle/blob/main/webapp/static/game.js

    let colorsArray = ["⬛", "⬛", "⬛", "⬛", "⬛"];
    let numberOfEachLetter = {};

    for (let letter of solutionWord) {
        numberOfEachLetter[letter] = numberOfEachLetter[letter] ? numberOfEachLetter[letter] += 1 : 1;
    }

    //color greens
    for (let i = 0; i < solutionWord.length; i++) {
        if (solutionWord[i] == guessedWord[i]) {
            colorsArray[i] = "🟩";

            numberOfEachLetter[guessedWord[i]] -= 1;
        }
    }

    //color yellows
    for (let i = 0; i < solutionWord.length; i++) {
        if (numberOfEachLetter[guessedWord[i]] && colorsArray[i] == "⬛") {
            colorsArray[i] = "🟨";

            numberOfEachLetter[guessedWord[i]] -= 1;
        }
    }

    return colorsArray;
}

//MARK: create wordle embed
function createWordleEmbed(embedColors, numberOfGuesses, encryptedSolution, gameFields) {

    const wordleEmbed = new EmbedBuilder()
    .setTitle(`Wordle Game`)
    .setColor(embedColors.blue)
    .setFooter({text: `Guess ${numberOfGuesses}/6 ● ${encryptedSolution}`})

    let boxString = ""
    for (let row of gameFields) {
        boxString += `${row.boxes.join("")} ${row.word}\n`
    }

    wordleEmbed.setDescription(boxString)

    return wordleEmbed
}

//MARK: used letters display
function handleUsedLettersDisplay(gameFields) {
    //proper spacing estimated by hand
    let keyboardTop = ""
    let keyboardMiddle = "     "
    let keyboardBottom = "                    "

    const keyboardTopEntries = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"]
    const keyboardMiddleEntries = ["A", "S", "D", "F", "G", "H", "J", "K", "L"]
    const keyboardBottomEntries = ["Z", "X", "C", "V", "B", "N", "M"]

    const keyboardLetters = keyboardTopEntries.concat(keyboardMiddleEntries, keyboardBottomEntries)

    let keyboardMapArray = []
    for (let letter of keyboardLetters) {
        //format:
        //[
        //  ["LETTER", "EMOJI"]
        //]
        keyboardMapArray.push([letter, "🔲"])
    }

    const letterStatus = new Map(keyboardMapArray)

    for (const field of gameFields) {
        for (let num = 0; num < 5; num++) {
            const letter = field.word[num]?.toUpperCase()
            const newBox = field.boxes[num]
            const currentBox = letterStatus.get(letter)

            if (letter && currentBox != "🟩") {
                letterStatus.set(letter, newBox)
            }
        }
    }

    for (const [key, val] of letterStatus.entries()) {
        if (keyboardTopEntries.includes(key)) {
            keyboardTop += `${val}${key} `
        } else if (keyboardMiddleEntries.includes(key)) {
            keyboardMiddle += `${val}${key} `
        } else if (keyboardBottomEntries.includes(key)) {
            keyboardBottom += `${val}${key} `
        }
    }

    const keyboardString = `${keyboardTop}\n${keyboardMiddle}\n${keyboardBottom}`

    return keyboardString
}