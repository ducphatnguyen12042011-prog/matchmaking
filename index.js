const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, PermissionsBitField, ChannelType 
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates
    ]
});

// --- CẤU HÌNH ---
const VERIFY_CHANNEL_ID = "1476164329962213477"; 
const CATEGORY_VOICE_ID = "ID_DANH_MUC_CUA_BAN"; // QUAN TRỌNG: Dán ID Category vào đây
const VIP_LINK = "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962";
const BANNER_URL = "https://i.imgur.com/your-cbam-banner.png"; 

const queues = { "1v1": { p: [], lim: 2 }, "2v2": { p: [], lim: 4 }, "5v5": { p: [], lim: 10 } };
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX"];

// Kết nối Database
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: { rejectUnauthorized: false }
});

client.on('ready', async () => {
    console.log(`🚀 [PRIMEBLOX SYSTEM] Online: ${client.user.tag}`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS users (discordId VARCHAR(255) PRIMARY KEY, robloxId VARCHAR(255), robloxName VARCHAR(255), elo INT DEFAULT 1000, wins INT DEFAULT 0, losses INT DEFAULT 0, verifyCode VARCHAR(255))`);
});

// --- HỆ THỐNG LỆNH CHAT ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).split(' ');
    const cmd = args[0].toLowerCase();

    // 1. LỆNH JOIN (!j)
    if (cmd === 'j') {
        const mode = args[1];
        if (!queues[mode]) return msg.reply("❌ **Cách dùng:** `!j 1v1`, `!j 2v2` hoặc `!j 5v5`!");

        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0] || !rows[0].robloxId) return msg.reply("⚠️ Bạn phải xác minh tại <#" + VERIFY_CHANNEL_ID + "> trước!");

        if (Object.values(queues).some(q => q.p.find(p => p.id === msg.author.id))) return msg.reply("🚫 Bạn đã ở trong hàng chờ!");

        queues[mode].p.push({ id: msg.author.id, name: rows[0].robloxName, elo: rows[0].elo });
        msg.channel.send({ embeds: [new EmbedBuilder().setDescription(`🔹 **${rows[0].robloxName}** vào hàng chờ **${mode}** \`[${queues[mode].p.length}/${queues[mode].lim}]\``).setColor(0x3498db)] });

        if (queues[mode].p.length === queues[mode].lim) {
            const players = [...queues[mode].p].sort(() => 0.5 - Math.random());
            queues[mode].p = [];
            const matchId = Math.floor(1000 + Math.random() * 9000);
            const rNames = [...teamNames].sort(() => 0.5 - Math.random());
            
            const team1 = players.slice(0, players.length/2);
            const team2 = players.slice(players.length/2);

            // --- TỰ ĐỘNG TẠO VOICE CHANNELS ---
            const guild = msg.guild;
            const v1 = await guild.channels.create({ name: `🔊 Team ${rNames[0]} (#${matchId})`, type: ChannelType.GuildVoice, parent: CATEGORY_VOICE_ID });
            const v2 = await guild.channels.create({ name: `🔊 Team ${rNames[1]} (#${matchId})`, type: ChannelType.GuildVoice, parent: CATEGORY_VOICE_ID });

            const match = { id: matchId, mode, t1Name: rNames[0], t2Name: rNames[1], t1P: team1, t2P: team2, voices: [v1.id, v2.id] };
            activeMatches.push(match);

            const matchEmbed = new EmbedBuilder()
                .setTitle(`⚔️ MATCH FOUND | ID: #${matchId}`)
                .setImage(BANNER_URL).setColor(0xFFAA00)
                .addFields(
                    { name: `🟦 TEAM ${match.t1Name}`, value: team1.map(p => `• ${p.name}`).join('\n'), inline: true },
                    { name: `🟥 TEAM ${match.t2Name}`, value: team2.map(p => `• ${p.name}`).join('\n'), inline: true }
                );
            msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

            // --- GỬI DM LINK VIP & VOICE ---
            const sendDM = async (pList, teamName, voiceChannel) => {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("🚀 TRẬN ĐẤU CỦA BẠN BẮT ĐẦU!")
                    .setDescription(`Bạn thuộc **Team ${teamName}**.\nHãy vào phòng Voice và Server VIP bên dưới.`)
                    .addFields({ name: '🔊 Voice Channel', value: `${voiceChannel.url}`, inline: true }, { name: '🎮 Mode', value: mode, inline: true })
                    .setColor(0x2ecc71);
                const dmRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('VÀO SERVER VIP').setStyle(ButtonStyle.Link).setURL(VIP_LINK));

                for (const p of pList) {
                    const user = await client.users.fetch(p.id).catch(() => null);
                    if (user) user.send({ embeds: [dmEmbed], components: [dmRow] }).catch(() => {});
                }
            };
            await sendDM(team1, match.t1Name, v1);
            await sendDM(team2, match.t2Name, v2);

            // --- KHÓA VOICE SAU 5 PHÚT ---
            setTimeout(async () => {
                const lock = async (vId, pList) => {
                    const ch = await guild.channels.fetch(vId).catch(() => null);
                    if (!ch) return;
                    await ch.permissionOverwrites.set([
                        { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
                        ...pList.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                    ]);
                };
                await lock(v1.id, team1);
                await lock(v2.id, team2);
            }, 5 * 60 * 1000);
        }
    }

    // 2. LỆNH WIN (!win)
    if (cmd === 'win') {
        if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
        const mId = parseInt(args[1]);
        const winTeam = args[2]?.toUpperCase();
        const score = args[3] || "N/A";

        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ Không tìm thấy Match ID!");

        const match = activeMatches[mIdx];
        const winners = (winTeam === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winTeam === match.t1Name) ? match.t2P : match.t1P;
        const loseTeamName = (winTeam === match.t1Name) ? match.t2Name : match.t1Name;

        for (const p of winners) await pool.execute('UPDATE users SET elo = elo + 25, wins = wins + 1 WHERE discordId = ?', [p.id]);
        for (const p of losers) await pool.execute('UPDATE users SET elo = elo - 20, losses = losses + 1 WHERE discordId = ?', [p.id]);

        const resEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU KẾT THÚC - ID #${mId}`)
            .setColor(0x00FF7F).setImage(BANNER_URL)
            .addFields(
                { name: `🏆 VICTORY: ${winTeam}`, value: winners.map(p => `\`${p.name}\` (+25)`).join('\n'), inline: true },
                { name: `💀 DEFEAT: ${loseTeamName}`, value: losers.map(p => `\`${p.name}\` (-20)`).join('\n'), inline: true },
                { name: '📊 SCORE', value: `\`\`\`css\n[ ${score} ]\`\`\``, inline: false }
            ).setFooter({ text: `Xác nhận bởi: ${msg.author.tag}` });
        
        msg.channel.send({ embeds: [resEmbed] });

        // Tự động xóa Voice khi xong trận
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.splice(mIdx, 1);
    }
});

// --- HỆ THỐNG XÁC MINH (VERIFY) ---
client.on('interactionCreate', async (i) => {
    if (i.customId === 'v_start' || i.customId === 'v_change') {
        const [rows] = await pool.execute('SELECT robloxId FROM users WHERE discordId = ?', [i.user.id]);
        if (i.customId === 'v_start' && rows.length > 0 && rows[0].robloxId) {
            return i.reply({ content: "⚠️ Bạn đã xác minh rồi! Dùng **Unlink** để làm lại.", ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('modal_v').setTitle('PrimeBlox Verify');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r_username').setLabel("Nhập Roblox Username").setStyle(TextInputStyle.Short).setRequired(true)));
        return i.showModal(modal);
    }

    if (i.type === InteractionType.ModalSubmit && i.customId === 'modal_v') {
        const username = i.fields.getTextInputValue('r_username');
        await i.deferReply({ ephemeral: true });
        try {
            const robloxId = await nblox.getIdFromUsername(username);
            const code = `PB-${Math.floor(10000 + Math.random() * 90000)}`;
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, verifyCode) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE robloxName = VALUES(robloxName), robloxId = VALUES(robloxId), verifyCode = VALUES(verifyCode)', [i.user.id, username, robloxId.toString(), code]);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('v_done').setLabel('XÁC NHẬN ĐÃ ĐỔI BIO').setStyle(ButtonStyle.Success));
            await i.editReply({ content: `👋 **Chào ${username}!**\nDán mã này vào **About/Bio** trên Roblox:\n\`${code}\``, components: [row] });
        } catch { await i.editReply("❌ Không tìm thấy Username Roblox!"); }
    }

    if (i.customId === 'v_done') {
        await i.deferReply({ ephemeral: true });
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);
        try {
            const profile = await nblox.getPlayerInfo(parseInt(rows[0].robloxId));
            if (profile.blurb && profile.blurb.includes(rows[0].verifyCode)) {
                await i.editReply(`✅ **Xác minh thành công!**`);
            } else { await i.editReply(`❌ Không tìm thấy mã trong Bio.`); }
        } catch { await i.editReply("❌ Lỗi API."); }
    }

    if (i.customId === 'v_unlink') {
        await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
        await i.reply({ content: "🔗 **Đã Unlink.** Nút Verify đã được mở lại.", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);;
