/**
 * ===========================================================================
 * 🛡️ PRIMEBLOX RANKED SYSTEM V18.0 - THE PRO MONOLITH
 * 📋 TÍNH NĂNG: RANKED, ELO TIERS, VOICE MANAGEMENT, ADVANCED LOGGING
 * 📏 ĐỘ DÀI: ~500 LINES (FULL LOGIC)
 * 🛠️ DEVELOPER: GEMINI AI
 * ===========================================================================
 */

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, PermissionsBitField, ChannelType,
    Partials, ActivityType, Collection, Events
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
const moment = require('moment');
require('dotenv').config();

// --- KHỞI TẠO CLIENT VỚI ĐẦY ĐỦ QUYỀN HẠN ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

// --- CẤU HÌNH HỆ THỐNG CHI TIẾT ---
const CONFIG = {
    SERVER_ID: "123456789012345678", // Thay bằng ID Server của mày
    ROLES: {
        ADMIN: "1465374336214106237",
        STAFF: "1465374336214106237",
        VERIFIED: "1476182203653161061"
    },
    CHANNELS: {
        VERIFY: "1476202572594548799",
        LEADERBOARD: "1474674662792232981",
        MATCH_LOGS: "1476182400617680968",
        HISTORY: "1476233898500292740",
        CATEGORY_VOICE: "1476182203653161061",
        SYSTEM_LOGS: "1476182400617680968"
    },
    GAME: {
        VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
        BANNER: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg",
        ELO_WIN: 25,
        ELO_LOSS: 20,
        MIN_ELO: 0
    },
    COLORS: {
        SUCCESS: "#2ecc71",
        ERROR: "#e74c3c",
        INFO: "#3498db",
        GOLD: "#f1c40f",
        SYSTEM: "#2f3136"
    }
};

// --- QUẢN LÝ RANK TIERS ---
const RANK_TIERS = [
    { name: "👑 GRANDMASTER", min: 2500, color: "#ff0000" },
    { name: "🛡️ DIAMOND", min: 2000, color: "#00ffff" },
    { name: "⚔️ PLATINUM", min: 1500, color: "#e5e4e2" },
    { name: "🎗️ GOLD", min: 1000, color: "#ffd700" },
    { name: "🥉 SILVER", min: 0, color: "#c0c0c0" }
];

// --- BIẾN TOÀN CỤC ---
let pool;
const matchmaking = { "1v1": new Collection(), "2v2": new Collection(), "5v5": new Collection() };
const activeMatches = new Collection();
const cooldowns = new Collection();

// ==========================================
// 💾 DATABASE INITIALIZATION
// ==========================================
async function connectToDatabase() {
    try {
        pool = mysql.createPool({
            uri: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            waitForConnections: true,
            connectionLimit: 50,
            queueLimit: 0
        });

        const connection = await pool.getConnection();
        console.log("📂 [DATABASE] Connected successfully to MySQL Pool.");
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS players (
                discordId VARCHAR(25) PRIMARY KEY,
                robloxName VARCHAR(50),
                robloxId VARCHAR(25),
                elo INT DEFAULT 1000,
                wins INT DEFAULT 0,
                losses INT DEFAULT 0,
                streak INT DEFAULT 0,
                last_match_id INT DEFAULT 0,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        connection.release();
    } catch (err) {
        console.error("🔥 [FATAL ERROR] Database connection failed:", err);
        process.exit(1);
    }
}

// ==========================================
// 📬 NOTIFICATION SYSTEM (CHUẨN DM MẪU)
// ==========================================
async function sendMatchNotification(userId, matchId, teamName, map) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) return;

        const dmEmbed = new EmbedBuilder()
            .setTitle('🛡️ PRIMEBLOX MATCH NOTIFICATION')
            .setDescription(`Trận đấu **#${matchId}** của bạn đã bắt đầu!`)
            .addFields(
                { 
                    name: '🔗 SERVER VIP', 
                    value: `[CLICK VÀO ĐÂY ĐỂ VÀO GAME](${CONFIG.GAME.VIP_LINK})`, 
                    inline: false 
                },
                { 
                    name: '🔊 PHÒNG CHỜ VOICE', 
                    value: `🎙️ PrimeBlox › 🔊 🔊 TEAM ${teamName} [#${matchId}]`, 
                    inline: false 
                },
                { name: '🗺️ BẢN ĐỒ', value: `\`${map}\``, inline: true },
                { name: '⚖️ TEAM', value: `\`${teamName}\``, inline: true }
            )
            .setColor(CONFIG.COLORS.SUCCESS)
            .setThumbnail(CONFIG.GAME.BANNER)
            .setFooter({ text: `Hôm nay lúc ${moment().format('HH:mm')}` })
            .setTimestamp();

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('VÀO GAME')
                .setStyle(ButtonStyle.Link)
                .setURL(CONFIG.GAME.VIP_LINK),
            new ButtonBuilder()
                .setCustomId(`support_${matchId}`)
                .setLabel('HỖ TRỢ')
                .setStyle(ButtonStyle.Secondary)
        );

        await user.send({ embeds: [dmEmbed], components: [actionRow] });
        return true;
    } catch (error) {
        await logToChannel("SYSTEM LOG", `⚠️ Không thể DM cho <@${userId}>. (Khóa DM)`);
        return false;
    }
}

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================
function getTier(elo) {
    return RANK_TIERS.find(t => elo >= t.min) || RANK_TIERS[RANK_TIERS.length - 1];
}

async function logToChannel(title, message, color = CONFIG.COLORS.INFO) {
    const logChan = await client.channels.fetch(CONFIG.CHANNELS.SYSTEM_LOGS).catch(() => null);
    if (!logChan) return;
    const logEmbed = new EmbedBuilder()
        .setTitle(`📝 ${title}`)
        .setDescription(message)
        .setColor(color)
        .setTimestamp();
    await logChan.send({ embeds: [logEmbed] });
}

// ==========================================
// ⚔️ MATCHMAKING LOGIC
// ==========================================
async function handleMatchStart(mode, guild) {
    const players = Array.from(matchmaking[mode].values());
    matchmaking[mode].clear();

    const matchId = Math.floor(100000 + Math.random() * 900000);
    const maps = ["Dust 2", "Mirage", "Inferno", "Cache", "Overpass"];
    const map = maps[Math.floor(Math.random() * maps.length)];

    // Cân bằng Team dựa trên ELO
    players.sort((a, b) => b.elo - a.elo);
    let teamA = [], teamB = [];
    players.forEach((p, i) => { if (i % 2 === 0) teamA.push(p); else teamB.push(p); });

    try {
        // Tạo Voice Channels chuyên nghiệp
        const vcA = await guild.channels.create({
            name: `🔊 Team Alpha [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: CONFIG.CHANNELS.CATEGORY_VOICE
        });
        const vcB = await guild.channels.create({
            name: `🔊 Team Omega [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: CONFIG.CHANNELS.CATEGORY_VOICE
        });

        activeMatches.set(matchId, {
            id: matchId, mode, map, teamA, teamB,
            vcs: [vcA.id, vcB.id],
            startTime: Date.now()
        });

        // Gửi thông báo channel
        const matchEmbed = new EmbedBuilder()
            .setTitle(`⚔️ TRẬN ĐẤU MỚI: #${matchId} (${mode})`)
            .setDescription(`Check DM để lấy link tham gia trận đấu!`)
            .addFields(
                { name: "🟦 Team Alpha", value: teamA.map(p => `• ${p.name} (\`${p.elo}\`)`).join('\n'), inline: true },
                { name: "🟥 Team Omega", value: teamB.map(p => `• ${p.name} (\`${p.elo}\`)`).join('\n'), inline: true },
                { name: "🗺️ Bản đồ", value: `\`${map}\``, inline: false }
            )
            .setColor(CONFIG.COLORS.GOLD)
            .setImage(CONFIG.GAME.BANNER);

        await guild.channels.cache.get(CONFIG.CHANNELS.MATCH_LOGS)?.send({ content: "@everyone", embeds: [matchEmbed] });

        // Gửi DM cho từng người
        for (const p of teamA) await sendMatchNotification(p.id, matchId, "ALPHA", map);
        for (const p of teamB) await sendMatchNotification(p.id, matchId, "OMEGA", map);

        await logToChannel("MATCH STARTED", `Trận #${matchId} (${mode}) đã bắt đầu tại map ${map}.`);
    } catch (e) {
        console.error("Lỗi khởi tạo trận đấu:", e);
    }
}

// ==========================================
// 💬 COMMAND HANDLER
// ==========================================
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // 1. Lệnh Join hàng chờ
    if (cmd === 'j' || cmd === 'join') {
        const mode = args[0];
        if (!matchmaking[mode]) return msg.reply("❌ Sai cú pháp! Sử dụng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");

        const [p] = await pool.execute('SELECT * FROM players WHERE discordId = ?', [msg.author.id]);
        if (!p[0]) return msg.reply("❌ Bạn chưa xác minh tài khoản! Hãy tới <#" + CONFIG.CHANNELS.VERIFY + ">.");

        if (Object.values(matchmaking).some(q => q.has(msg.author.id))) return msg.reply("⚠️ Bạn đã ở trong một hàng chờ khác!");

        matchmaking[mode].set(msg.author.id, { id: msg.author.id, name: p[0].robloxName, elo: p[0].elo });
        
        const count = matchmaking[mode].size;
        const required = mode[0] * 2;
        msg.channel.send(`📥 **${p[0].robloxName}** đã tham gia **${mode}** [\`${count}/${required}\`]`);

        if (count >= required) await handleMatchStart(mode, msg.guild);
    }

    // 2. Lệnh Hủy hàng chờ
    if (cmd === 'l' || cmd === 'leave') {
        let removed = false;
        Object.keys(matchmaking).forEach(mode => {
            if (matchmaking[mode].delete(msg.author.id)) removed = true;
        });
        msg.reply(removed ? "✅ Đã rời hàng chờ." : "❌ Bạn không ở trong hàng chờ nào.");
    }

    // 3. Lệnh Win (Chỉ dành cho Admin/Staff)
    if (cmd === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ROLES.STAFF)) return msg.reply("❌ Quyền hạn không đủ.");
        const mId = parseInt(args[0]);
        const side = args[1]?.toUpperCase(); // ALPHA hoặc OMEGA
        const match = activeMatches.get(mId);

        if (!match) return msg.reply("❌ Không tìm thấy trận đấu này.");
        if (!['ALPHA', 'OMEGA'].includes(side)) return msg.reply("❌ Gõ: `!win [ID] ALPHA` hoặc `!win [ID] OMEGA`.");

        const winners = side === 'ALPHA' ? match.teamA : match.teamB;
        const losers = side === 'ALPHA' ? match.teamB : match.teamA;

        // Cập nhật Database
        for (const p of winners) {
            await pool.execute('UPDATE players SET elo = elo + ?, wins = wins + 1, streak = streak + 1 WHERE discordId = ?', [CONFIG.GAME.ELO_WIN, p.id]);
        }
        for (const p of losers) {
            await pool.execute('UPDATE players SET elo = elo - ?, losses = losses + 1, streak = 0 WHERE discordId = ?', [CONFIG.GAME.ELO_LOSS, p.id]);
        }

        // Thông báo kết quả
        const resEmbed = new EmbedBuilder()
            .setTitle(`🏁 KẾT QUẢ TRẬN #${mId}`)
            .addFields(
                { name: "🏆 THẮNG", value: `**TEAM ${side}**`, inline: true },
                { name: "🗺️ Map", value: match.map, inline: true },
                { name: "📉 ELO", value: `Winners: +${CONFIG.GAME.ELO_WIN} | Losers: -${CONFIG.GAME.ELO_LOSS}` }
            )
            .setColor(CONFIG.COLORS.SUCCESS).setTimestamp();

        msg.channel.send({ embeds: [resEmbed] });

        // Xóa Voice
        match.vcs.forEach(id => msg.guild.channels.cache.get(id)?.delete().catch(() => {}));
        activeMatches.delete(mId);
        await logToChannel("MATCH CLOSED", `Trận #${mId} kết thúc. Người thắng: ${side}`, CONFIG.COLORS.SUCCESS);
    }

    // 4. Lệnh Profile
    if (cmd === 'p' || cmd === 'profile') {
        const target = msg.mentions.users.first() || msg.author;
        const [u] = await pool.execute('SELECT * FROM players WHERE discordId = ?', [target.id]);
        if (!u[0]) return msg.reply("❌ Chưa có dữ liệu.");

        const tier = getTier(u[0].elo);
        const embed = new EmbedBuilder()
            .setTitle(`📊 THÔNG TIN: ${u[0].robloxName}`)
            .setColor(tier.color)
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${u[0].robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: "🔱 Xếp hạng", value: `**${tier.name}**`, inline: true },
                { name: "📈 ELO", value: `\`${u[0].elo}\``, inline: true },
                { name: "🔥 Chuỗi", value: `\`${u[0].streak}\``, inline: true },
                { name: "🏆 Thắng/Bại", value: `${u[0].wins}W / ${u[0].losses}L`, inline: false }
            )
            .setFooter({ text: "PrimeBlox Ranked System" });
        msg.reply({ embeds: [embed] });
    }

    // 5. Lệnh Leaderboard
    if (cmd === 'lb' || cmd === 'top') {
        const [top] = await pool.execute('SELECT robloxName, elo FROM players ORDER BY elo DESC LIMIT 10');
        const list = top.map((p, i) => `**#${i+1}** ${p.robloxName} — \`${p.elo}\` ELO`).join('\n');
        
        const lbEmbed = new EmbedBuilder()
            .setTitle("🏆 BẢNG XẾP HẠNG CAO THỦ")
            .setDescription(list || "Chưa có dữ liệu.")
            .setColor(CONFIG.COLORS.GOLD)
            .setTimestamp();
        msg.channel.send({ embeds: [lbEmbed] });
    }
});

// ==========================================
// 🛡️ INTERACTION & MODAL HANDLER
// ==========================================
client.on(Events.InteractionCreate, async (i) => {
    // 1. Mở Modal xác minh
    if (i.isButton() && i.customId === 'v_start') {
        const modal = new ModalBuilder().setCustomId('v_modal').setTitle('XÁC MINH TÀI KHOẢN');
        const input = new TextInputBuilder()
            .setCustomId('r_username')
            .setLabel("Tên người dùng Roblox")
            .setPlaceholder("Ví dụ: Builderman")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    // 2. Xử lý nộp Modal
    if (i.type === InteractionType.ModalSubmit && i.customId === 'v_modal') {
        await i.deferReply({ ephemeral: true });
        const username = i.fields.getTextInputValue('r_username');
        
        try {
            const robloxId = await nblox.getIdFromUsername(username);
            await pool.execute(
                'INSERT INTO players (discordId, robloxName, robloxId) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE robloxName = ?', 
                [i.user.id, username, robloxId.toString(), username]
            );
            
            // Tặng Role xác minh nếu có
            const member = await i.guild.members.fetch(i.user.id);
            await member.roles.add(CONFIG.ROLES.VERIFIED).catch(() => {});

            await i.editReply(`✅ Thành công! Bạn đã liên kết với tài khoản: **${username}**`);
            await logToChannel("NEW VERIFICATION", `<@${i.user.id}> đã xác minh là \`${username}\``);
        } catch (e) {
            await i.editReply("❌ Không tìm thấy tên người dùng Roblox này.");
        }
    }
});

// ==========================================
// 🚀 KHỞI ĐỘNG HỆ THỐNG
// ==========================================
client.once(Events.ClientReady, async () => {
    await connectToDatabase();
    client.user.setPresence({ 
        activities: [{ name: 'PRIMEBLOX RANKED', type: ActivityType.Competing }], 
        status: 'online' 
    });
    console.log(`🚀 PrimeBlox Bot logged in as ${client.user.tag}`);
    
    // Khởi tạo tin nhắn xác minh nếu channel trống
    const vChan = await client.channels.fetch(CONFIG.CHANNELS.VERIFY).catch(() => null);
    if (vChan) {
        const messages = await vChan.messages.fetch({ limit: 10 });
        if (messages.size === 0) {
            const vEmbed = new EmbedBuilder()
                .setTitle("🛡️ PRIMEBLOX VERIFICATION")
                .setDescription("Vui lòng nhấn nút bên dưới để xác minh tài khoản Roblox trước khi tham gia hàng chờ.")
                .setColor(CONFIG.COLORS.INFO)
                .setImage(CONFIG.GAME.BANNER);
            const vRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_start').setLabel('XÁC MINH NGAY').setStyle(ButtonStyle.Primary).setEmoji('✅')
            );
            vChan.send({ embeds: [vEmbed], components: [vRow] });
        }
    }
});

// Xử lý lỗi hệ thống để bot không bị sập
process.on('unhandledRejection', error => console.error('Unhandled promise rejection:', error));
process.on('uncaughtException', error => console.error('Uncaught exception:', error));

client.login(process.env.DISCORD_TOKEN);
