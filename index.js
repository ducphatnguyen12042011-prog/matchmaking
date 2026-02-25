const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, ChannelType 
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// --- CẤU HÌNH ---
const VERIFY_CHANNEL_ID = "1476164329962213477"; 
const queues = { "1v1": { p: [], lim: 2 }, "2v2": { p: [], lim: 4 }, "5v5": { p: [], lim: 10 } };
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX"];

// --- KẾT NỐI MYSQL ---
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: { rejectUnauthorized: false }
});

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
        console.log("✅ MySQL Connected & Database Ready");
    } catch (err) {
        console.error("❌ MySQL Connection Error: ", err);
    }
}

// --- KHI BOT ONLINE ---
client.on('ready', async () => {
    console.log(`🚀 Bot Online: ${client.user.tag}`);
    await initDB();

    // Tự động gửi và ghim bảng Verify
    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
    if (channel) {
        const messages = await channel.messages.fetch({ limit: 10 });
        const exists = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("Verification"));
        
        if (!exists) {
            const embed = new EmbedBuilder()
                .setTitle("🔒 PrimeBlox — Account Verification")
                .setDescription("Vui lòng liên kết tài khoản Roblox để tham gia đấu hạng.\n\n" +
                    "1. Nhấn nút **Verify Account** bên dưới.\n" +
                    "2. Nhập tên Roblox và đổi phần **About/Bio** thành mã bot cấp.\n" +
                    "3. Nhấn **Done** để hoàn tất.")
                .setColor(0xFFAA00);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_start').setLabel('Verify Account').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('v_unlink').setLabel('Unlink').setStyle(ButtonStyle.Danger)
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });
            msg.pin().catch(() => console.log("Không có quyền ghim tin nhắn!"));
        }
    }
});

// --- XỬ LÝ LỆNH CHAT ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).split(' ');
    const cmd = args[0].toLowerCase();

    // 1. Lệnh Join Queue (!j 1v1)
    if (cmd === 'j') {
        const mode = args[1];
        if (!queues[mode]) return msg.reply("❌ Sử dụng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`!");

        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        const userData = rows[0];

        if (!userData || !userData.robloxId) {
            return msg.reply(`❌ **Bạn chưa xác minh!** Hãy xác minh tại <#${VERIFY_CHANNEL_ID}>`);
        }

        if (Object.values(queues).some(q => q.p.find(p => p.id === msg.author.id))) {
            return msg.reply("⚠️ Bạn đã ở trong hàng chờ rồi!");
        }

        queues[mode].p.push({ id: msg.author.id, name: userData.robloxName, elo: userData.elo });
        msg.channel.send(`✅ **${userData.robloxName}** (${userData.elo} ELO) đã vào queue **${mode}** (${queues[mode].p.length}/${queues[mode].lim})`);

        if (queues[mode].p.length === queues[mode].lim) {
            const players = [...queues[mode].p].sort(() => 0.5 - Math.random());
            const matchId = Math.floor(1000 + Math.random() * 9000);
            const rNames = [...teamNames].sort(() => 0.5 - Math.random());

            const matchData = {
                id: matchId,
                mode,
                t1Name: rNames[0],
                t2Name: rNames[1],
                t1Players: players.slice(0, players.length / 2),
                t2Players: players.slice(players.length / 2)
            };
            activeMatches.push(matchData);

            const embed = new EmbedBuilder()
                .setTitle(`⚔️ MATCH FOUND: ${mode} (#${matchId})`)
                .addFields(
                    { name: `🟦 Team ${matchData.t1Name}`, value: matchData.t1Players.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true },
                    { name: `🟥 Team ${matchData.t2Name}`, value: matchData.t2Players.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true }
                )
                .setColor(0x5865F2)
                .setFooter({ text: `Báo kết quả: !win ${matchId} ${matchData.t1Name} hoặc !win ${matchId} ${matchData.t2Name}` });

            msg.channel.send({ content: "@everyone", embeds: [embed] });
            queues[mode].p = [];
        }
    }

    // 2. Lệnh Win (!win <ID> <TênTeam>)
    if (cmd === 'win') {
        if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
        
        const mId = parseInt(args[1]);
        const winnerInput = args[2]?.toUpperCase();
        const mIdx = activeMatches.findIndex(m => m.id === mId);

        if (mIdx === -1) return msg.reply("❌ Không tìm thấy trận đấu này!");
        const match = activeMatches[mIdx];

        if (winnerInput !== match.t1Name && winnerInput !== match.t2Name) {
            return msg.reply(`❌ Tên team thắng phải là **${match.t1Name}** hoặc **${match.t2Name}**!`);
        }

        const winners = (winnerInput === match.t1Name) ? match.t1Players : match.t2Players;
        const losers = (winnerInput === match.t1Name) ? match.t2Players : match.t1Players;

        for (const p of winners) {
            await pool.execute('UPDATE users SET elo = elo + 25, wins = wins + 1 WHERE discordId = ?', [p.id]);
        }
        for (const p of losers) {
            await pool.execute('UPDATE users SET elo = elo - 20, losses = losses + 1 WHERE discordId = ?', [p.id]);
        }

        msg.channel.send(`🏆 **Trận #${mId} kết thúc!**\nTeam **${winnerInput}** thắng! (Người thắng +25 ELO, Người thua -20 ELO)`);
        activeMatches.splice(mIdx, 1);
    }

    // 3. Lệnh Stats (!stats)
    if (cmd === 'stats') {
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply("❌ Bạn chưa xác minh!");
        const rank = rows[0].elo >= 1500 ? "Vàng" : rows[0].elo >= 1200 ? "Bạc" : "Đồng";
        msg.reply(`📊 **Stats của ${rows[0].robloxName}**:\n- ELO: \`${rows[0].elo}\`\n- Hạng: \`${rank}\`\n- Thắng/Thua: \`${rows[0].wins}W - ${rows[0].losses}L\``);
    }
});

// --- XỬ LÝ VERIFY (INTERACTION) ---
client.on('interactionCreate', async (i) => {
    if (i.customId === 'v_start') {
        const modal = new ModalBuilder().setCustomId('modal_v').setTitle('Verify Roblox Account');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('r_username').setLabel("Tên nhân vật Roblox").setStyle(TextInputStyle.Short).setRequired(true)
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

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('v_done').setLabel('Done').setStyle(ButtonStyle.Success));
            await i.editReply({ content: `Vui lòng đổi **About Me** trên Roblox thành: \`${code}\` sau đó nhấn nút **Done**.`, components: [row] });
        } catch {
            await i.editReply("❌ Không tìm thấy tên Roblox này. Hãy thử lại!");
        }
    }

    if (i.customId === 'v_done') {
        await i.deferReply({ ephemeral: true });
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);
        if (!rows[0]) return i.editReply("Hãy bấm Verify lại từ đầu.");

        try {
            const profile = await nblox.getPlayerInfo(parseInt(rows[0].robloxId));
            if (profile.blurb && profile.blurb.includes(rows[0].verifyCode)) {
                await i.editReply(`✅ Xác minh thành công! Chào mừng **${rows[0].robloxName}**.`);
            } else {
                await i.editReply(`❌ Không tìm thấy mã! Đảm bảo Bio có chứa: \`${rows[0].verifyCode}\``);
            }
        } catch {
            await i.editReply("❌ Lỗi hệ thống Roblox. Thử lại sau!");
        }
    }

    if (i.customId === 'v_unlink') {
        await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
        await i.reply({ content: "🔗 Đã hủy liên kết tài khoản.", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
