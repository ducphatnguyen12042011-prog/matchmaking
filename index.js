const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, PermissionsBitField 
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- CONFIGURATION ---
const VERIFY_CHANNEL_ID = "1476164329962213477"; 
const queues = { "1v1": { p: [], lim: 2 }, "2v2": { p: [], lim: 4 }, "5v5": { p: [], lim: 10 } };
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX"];

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: { rejectUnauthorized: false }
});

// --- INITIALIZE DATABASE ---
async function initDB() {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                discordId VARCHAR(255) PRIMARY KEY,
                robloxId VARCHAR(255),
                robloxName VARCHAR(255),
                elo INT DEFAULT 1000,
                wins INT DEFAULT 0,
                losses INT DEFAULT 0,
                verifyCode VARCHAR(255)
            )
        `);
        console.log("✅ MySQL Connected & Ready");
    } catch (err) {
        console.error("❌ Database Error: ", err);
    }
}

// --- BOT READY & AUTO PIN ---
client.on('ready', async () => {
    console.log(`🚀 Bot Online: ${client.user.tag}`);
    await initDB();

    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
    if (channel) {
        const messages = await channel.messages.fetch({ limit: 10 });
        const exists = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("Verification"));
        
        if (!exists) {
            const embed = new EmbedBuilder()
                .setTitle("🔒 PrimeBlox — Account Verification")
                .setAuthor({ name: 'PrimeBlox Competitive System', iconURL: client.user.displayAvatarURL() })
                .setDescription("Hãy liên kết tài khoản Roblox của bạn để tham gia vào các trận đấu hạng và tích lũy điểm ELO.\n\n" +
                    "**Hướng dẫn nhanh:**\n" +
                    "1️⃣ Nhấn **Verify Account** để bắt đầu.\n" +
                    "2️⃣ Nhập chính xác **Username Roblox**.\n" +
                    "3️⃣ Cập nhật phần **About Me** trên profile Roblox theo mã bot cấp.\n" +
                    "4️⃣ Nhấn **Done** để hệ thống xác nhận.")
                .addFields({ name: '⚠️ Lưu ý', value: 'Điểm ELO sẽ bị reset nếu bạn Unlink tài khoản.' })
                .setImage('https://i.imgur.com/your-image-banner.png') // Thay bằng link ảnh của bạn nếu có
                .setColor(0xFFAA00)
                .setFooter({ text: 'PrimeBlox Verification System • © 2026' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_start').setLabel('Verify Account').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('v_change').setLabel('Change Account').setStyle(ButtonStyle.Primary).setEmoji('ℹ️'),
                new ButtonBuilder().setCustomId('v_unlink').setLabel('Unlink').setStyle(ButtonStyle.Danger).setEmoji('🔗')
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });
            msg.pin().catch(() => {});
        }
    }
});

// --- CHAT COMMANDS (!j, !stats, !win) ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).split(' ');
    const cmd = args[0].toLowerCase();

    // Stats Command
    if (cmd === 'stats') {
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0] || !rows[0].robloxId) return msg.reply("❌ Bạn chưa xác minh tài khoản!");
        
        const userData = rows[0];
        const avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userData.robloxId}&width=420&height=420&format=png`;
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 Thống kê người chơi: ${userData.robloxName}`)
            .setThumbnail(avatarUrl)
            .setColor(0x00FF7F)
            .addFields(
                { name: '🔥 ELO Rating', value: `\`${userData.elo}\``, inline: true },
                { name: '🏆 Thắng', value: `\`${userData.wins}\``, inline: true },
                { name: '💀 Thua', value: `\`${userData.losses}\``, inline: true }
            )
            .setFooter({ text: `Discord ID: ${msg.author.id}` });

        msg.reply({ embeds: [embed] });
    }

    // Join Command
    if (cmd === 'j') {
        const mode = args[1];
        if (!queues[mode]) return msg.reply("❌ Định dạng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`!");

        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0] || !rows[0].robloxId) return msg.reply("❌ Bạn phải xác minh trước!");

        if (Object.values(queues).some(q => q.p.find(p => p.id === msg.author.id))) return msg.reply("⚠️ Bạn đã ở trong hàng chờ!");

        queues[mode].p.push({ id: msg.author.id, name: rows[0].robloxName, elo: rows[0].elo });
        msg.channel.send(`✅ **${rows[0].robloxName}** đã vào queue **${mode}** (${queues[mode].p.length}/${queues[mode].lim})`);

        if (queues[mode].p.length === queues[mode].lim) {
            const players = [...queues[mode].p].sort(() => 0.5 - Math.random());
            const matchId = Math.floor(1000 + Math.random() * 9000);
            const rNames = [...teamNames].sort(() => 0.5 - Math.random());

            const matchData = {
                id: matchId, mode,
                t1Name: rNames[0], t2Name: rNames[1],
                t1Players: players.slice(0, players.length / 2),
                t2Players: players.slice(players.length / 2)
            };
            activeMatches.push(matchData);

            const matchEmbed = new EmbedBuilder()
                .setTitle(`⚔️ TRẬN ĐẤU BẮT ĐẦU: ${mode} (#${matchId})`)
                .addFields(
                    { name: `🟦 Team ${matchData.t1Name}`, value: matchData.t1Players.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true },
                    { name: `🟥 Team ${matchData.t2Name}`, value: matchData.t2Players.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });
            queues[mode].p = [];
        }
    }
});

// --- INTERACTIONS (VERIFY, CHANGE, DONE) ---
client.on('interactionCreate', async (i) => {
    // Verify & Change Account logic
    if (i.customId === 'v_start' || i.customId === 'v_change') {
        const modal = new ModalBuilder().setCustomId('modal_v').setTitle('Xác minh tài khoản Roblox');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('r_username').setLabel("Tên hiển thị (Username)").setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(modal);
    }

    if (i.type === InteractionType.ModalSubmit && i.customId === 'modal_v') {
        const username = i.fields.getTextInputValue('r_username');
        await i.deferReply({ ephemeral: true });

        try {
            const robloxId = await nblox.getIdFromUsername(username);
            const code = `PB-${Math.floor(10000 + Math.random() * 90000)}`;
            
            await pool.execute(
                'INSERT INTO users (discordId, robloxName, robloxId, verifyCode) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE robloxName = VALUES(robloxName), robloxId = VALUES(robloxId), verifyCode = VALUES(verifyCode)',
                [i.user.id, username, robloxId.toString(), code]
            );

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('v_done').setLabel('Xác nhận đã đổi Bio').setStyle(ButtonStyle.Success));
            await i.editReply({ 
                content: `👋 Chào **${username}**, để hoàn tất, hãy đổi phần **About/Bio** trên Roblox thành: \`${code}\``,
                components: [row] 
            });
        } catch {
            await i.editReply("❌ Không tìm thấy Username Roblox này! Vui lòng kiểm tra lại.");
        }
    }

    if (i.customId === 'v_done') {
        await i.deferReply({ ephemeral: true });
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);
        try {
            const profile = await nblox.getPlayerInfo(parseInt(rows[0].robloxId));
            if (profile.blurb && profile.blurb.includes(rows[0].verifyCode)) {
                await i.editReply(`✅ Xác minh hoàn tất! Tài khoản: **${rows[0].robloxName}**.`);
            } else {
                await i.editReply(`❌ Không tìm thấy mã: \`${rows[0].verifyCode}\` trong Bio của bạn.`);
            }
        } catch { await i.editReply("❌ Lỗi API Roblox. Thử lại sau!"); }
    }

    if (i.customId === 'v_unlink') {
        await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
        await i.reply({ content: "🔗 Đã xóa liên kết và reset điểm ELO của bạn.", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
