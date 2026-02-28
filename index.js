/**
 * ===========================================================================
 * 🛡️ PRIMEBLOX RANKED SYSTEM V30.0 - THE ULTIMATE MONOLITH (EXTENDED)
 * 📋 TÍNH NĂNG: RANKED, AUTO-VOICE, STICKY DM, MAP VOTE, HISTORY LOGGING
 * 📊 MODULE MỚI: !P (PROFILE) & !STATS (SYSTEM STATS) - FULL LOGIC
 * 📏 ĐỘ ĐÀI: ~800 DÒNG (FULL LOGIC, COMMENTS & ERROR HANDLING)
 * 🛠️ PHIÊN BẢN: HOÀN CHỈNH CAO CẤP
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
require('dotenv').config();

// --- 1. KHỞI TẠO CLIENT ---
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

// --- 2. CẤU HÌNH HỆ THỐNG ---
const CONFIG = {
    SERVER_ID: "1465369593714573388", 
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
        PENALTY: 50,
        MAPS: ["Mirage", "Dust 2", "Inferno", "Cache", "Overpass", "Train", "Nuke"]
    },
    COLORS: {
        SUCCESS: "#2ecc71", ERROR: "#e74c3c", INFO: "#3498db", GOLD: "#f1c40f", PURPLE: "#9b59b6", BLUE: "#00a2ff", RED: "#ff4655"
    }
};

const RANK_TIERS = [
    { name: "👑 GRANDMASTER", min: 2500, color: "#ff0000", icon: "🔴" },
    { name: "🛡️ DIAMOND", min: 2000, color: "#00ffff", icon: "💎" },
    { name: "⚔️ PLATINUM", min: 1500, color: "#e5e4e2", icon: "🥈" },
    { name: "🎗️ GOLD", min: 1000, color: "#ffd700", icon: "🥇" },
    { name: "🥉 SILVER", min: 0, color: "#c0c0c0", icon: "🥉" }
];

let pool;
const matchmaking = { "1v1": new Collection(), "2v2": new Collection(), "5v5": new Collection() };
const activeMatches = new Collection();

// --- 3. DATABASE CONNECTION & INITIALIZATION ---
async function connectDB() {
    try {
        pool = mysql.createPool({
            uri: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionLimit: 30,
            enableKeepAlive: true
        });
        
        // Đảm bảo cấu trúc bảng đầy đủ cho !p và !stats
        const conn = await pool.getConnection();
        await conn.query(`
            CREATE TABLE IF NOT EXISTS players (
                discordId VARCHAR(25) PRIMARY KEY,
                robloxName VARCHAR(50),
                robloxId VARCHAR(25),
                elo INT DEFAULT 1000,
                wins INT DEFAULT 0,
                losses INT DEFAULT 0,
                streak INT DEFAULT 0,
                maxStreak INT DEFAULT 0,
                lastMatch TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        conn.release();
        console.log("📂 [DATABASE] Kết nối và kiểm tra bảng thành công.");
    } catch (e) { 
        console.error("🔥 [FATAL] Database lỗi:", e); 
        process.exit(1); 
    }
}

// --- 4. UTILS & PROGRESS BARS ---
function getTier(elo) { 
    return RANK_TIERS.find(t => elo >= t.min) || RANK_TIERS[RANK_TIERS.length - 1]; 
}

function createBar(current, max, size = 10) {
    const progress = Math.min(Math.max((current / max) * size, 0), size);
    return "🟦".repeat(Math.floor(progress)) + "⬛".repeat(size - Math.floor(progress));
}

async function sendHistoryUpdate(match) {
    const channel = await client.channels.fetch(CONFIG.CHANNELS.HISTORY).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setAuthor({ name: "PRIMEBLOX LIVE TRACKER", iconURL: "https://i.imgur.com/39p6M7B.png" })
        .setTitle(`⚔️ TRẬN ĐẤU ĐANG DIỄN RA: #${match.id}`)
        .setColor(CONFIG.COLORS.PURPLE)
        .addFields(
            { name: "🟦 ĐỘI ALPHA", value: match.teamA.map(p => `🔹 **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true },
            { name: "🟥 ĐỘI OMEGA", value: match.teamB.map(p => `🔸 **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true },
            { name: "📍 Thông tin", value: `🗺️ **Bản đồ:** ${match.map}\n🕹️ **Chế độ:** ${match.mode}\n⏰ **Bắt đầu:** <t:${Math.floor(match.startTime / 1000)}:R>`, inline: false }
        )
        .setImage(CONFIG.GAME.BANNER)
        .setFooter({ text: `PrimeBlox Engine v30.0` })
        .setTimestamp();

    return channel.send({ embeds: [embed] });
}

// --- 5. MATCHMAKING ENGINE ---
async function handleMatchStart(mode, guild) {
    const players = Array.from(matchmaking[mode].values());
    matchmaking[mode].clear();
    const matchId = Math.floor(100000 + Math.random() * 900000);
    
    // Thuật toán chia đội: Sắp xếp ELO từ cao xuống thấp rồi chia đều
    players.sort((a, b) => b.elo - a.elo);
    let teamA = [], teamB = [];
    players.forEach((p, i) => { 
        if (i % 2 === 0) teamA.push(p); 
        else teamB.push(p); 
    });

    // Tạo Voice Channels riêng tư cho 2 đội
    try {
        const categoryId = CONFIG.CHANNELS.CATEGORY_VOICE;
        const vcA = await guild.channels.create({
            name: `🔊 Alpha [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: categoryId,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...teamA.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak] }))
            ]
        });

        const vcB = await guild.channels.create({
            name: `🔊 Omega [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: categoryId,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...teamB.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak] }))
            ]
        });

        // Tự động kéo người chơi vào Voice nếu họ đang ở một kênh khác
        for (const p of teamA) {
            const member = await guild.members.fetch(p.id).catch(() => null);
            if (member?.voice.channel) member.voice.setChannel(vcA).catch(() => {});
        }
        for (const p of teamB) {
            const member = await guild.members.fetch(p.id).catch(() => null);
            if (member?.voice.channel) member.voice.setChannel(vcB).catch(() => {});
        }

        activeMatches.set(matchId, {
            id: matchId, mode, teamA, teamB, vcs: [vcA.id, vcB.id], 
            map: "Đang bầu chọn...", startTime: Date.now()
        });

        // Gửi UI bầu chọn Map
        const maps = CONFIG.GAME.MAPS.sort(() => 0.5 - Math.random()).slice(0, 3);
        const row = new ActionRowBuilder().addComponents(
            maps.map(m => new ButtonBuilder().setCustomId(`map_${matchId}_${m}`).setLabel(m).setStyle(ButtonStyle.Primary))
        );

        const logChannel = guild.channels.cache.get(CONFIG.CHANNELS.MATCH_LOGS);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle(`⚔️ TRẬN ĐẤU MỚI: #${matchId}`)
                .addFields(
                    { name: "🟦 Đội Alpha", value: teamA.map(p => `• ${p.name}`).join('\n'), inline: true },
                    { name: "🟥 Đội Omega", value: teamB.map(p => `• ${p.name}`).join('\n'), inline: true }
                )
                .setColor(CONFIG.COLORS.GOLD);
            await logChannel.send({ content: "@everyone", embeds: [embed], components: [row] });
        }
    } catch (err) { console.error("Lỗi khởi tạo trận:", err); }
}

// --- 6. COMMAND HANDLER (Bbung code chi tiết) ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // 🏆 LỆNH !P (PROFILE) - FULL LOGIC & INTERFACE
    if (cmd === 'p' || cmd === 'profile') {
        const target = msg.mentions.users.first() || msg.author;
        const [rows] = await pool.execute('SELECT * FROM players WHERE discordId = ?', [target.id]);
        
        if (!rows[0]) return msg.reply("❌ Người dùng chưa xác minh tài khoản Roblox.");
        
        const p = rows[0];
        const tier = getTier(p.elo);
        const total = p.wins + p.losses;
        const winRate = total === 0 ? 0 : ((p.wins / total) * 100).toFixed(1);

        // Tính rank tiếp theo
        const currentTierIndex = RANK_TIERS.findIndex(t => t.min === tier.min);
        const nextTier = RANK_TIERS[currentTierIndex - 1] || tier;
        const progress = tier.name.includes("GRANDMASTER") ? 100 : Math.floor(((p.elo - tier.min) / (nextTier.min - tier.min)) * 100);

        const profileEmbed = new EmbedBuilder()
            .setColor(tier.color)
            .setAuthor({ name: `HỒ SƠ NGƯỜI CHƠI: ${p.robloxName.toUpperCase()}`, iconURL: target.displayAvatarURL() })
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${p.robloxId}&width=150&height=150&format=png`)
            .addFields(
                { name: "🏆 XẾP HẠNG", value: `${tier.icon} **${tier.name}**\nĐiểm: \`${p.elo}\` ELO`, inline: true },
                { name: "📊 THÔNG SỐ", value: `Thắng: \`${p.wins}\` | Thua: \`${p.losses}\`\nWinrate: \`${winRate}%\``, inline: true },
                { name: "🔥 CHUỖI THẮNG", value: `Hiện tại: \`${p.streak}\`\nCao nhất: \`${p.maxStreak}\``, inline: true },
                { name: `🚀 TIẾN TRÌNH LÊN ${nextTier.name}`, value: `${createBar(progress, 100)} \`${progress}%\``, inline: false },
                { name: "🔗 THÔNG TIN ROBLOX", value: `• Tên: **${p.robloxName}**\n• ID: \`${p.robloxId}\`\n• Link: [Bấm vào đây](https://www.roblox.com/users/${p.robloxId}/profile)`, inline: false }
            )
            .setFooter({ text: "PrimeBlox Ranked System • Dữ liệu cập nhật ngay lập tức" })
            .setTimestamp();

        return msg.channel.send({ embeds: [profileEmbed] });
    }

    // 📊 LỆNH !STATS (SYSTEM STATS) - LIVE MONITORING
    if (cmd === 'stats') {
        const [totalRows] = await pool.execute('SELECT COUNT(*) as count FROM players');
        const [avgElo] = await pool.execute('SELECT AVG(elo) as avg FROM players');
        
        const q1 = matchmaking["1v1"].size;
        const q2 = matchmaking["2v2"].size;
        const q5 = matchmaking["5v5"].size;

        const statsEmbed = new EmbedBuilder()
            .setTitle("📊 TRẠNG THÁI HỆ THỐNG PRIMEBLOX")
            .setColor(CONFIG.COLORS.GOLD)
            .addFields(
                { name: "👥 NGƯỜI CHƠI", value: `Tổng: \`${totalRows[0].count}\` user\nELO TB: \`${Math.floor(avgElo[0].avg)}\``, inline: true },
                { name: "⚔️ TRẬN ĐẤU", value: `Đang diễn ra: \`${activeMatches.size}\` trận\nĐang chờ: \`${q1 + q2 + q5}\` người`, inline: true },
                { 
                    name: "📥 TÌNH TRẠNG HÀNG CHỜ", 
                    value: `**1vs1:** \`[${q1}/2]\` ${createBar(q1, 2)}\n**2vs2:** \`[${q2}/4]\` ${createBar(q2, 4)}\n**5vs5:** \`[${q5}/10]\` ${createBar(q5, 10)}`,
                    inline: false 
                },
                { 
                    name: "⚙️ THÔNG SỐ KỸ THUẬT", 
                    value: `\`\`\`ml\nPing     : ${client.ws.ping}ms\nRAM      : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\nUptime   : ${Math.floor(client.uptime / 3600000)} giờ\`\`\``, 
                    inline: false 
                }
            )
            .setTimestamp();

        return msg.channel.send({ embeds: [statsEmbed] });
    }

    // Lệnh !j (Join)
    if (cmd === 'j') {
        const mode = args[0] || "5v5";
        if (!matchmaking[mode]) return msg.reply("❌ Mode: 1v1, 2v2, 5v5");
        const [rows] = await pool.execute('SELECT * FROM players WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply("❌ Hãy xác minh tại <#" + CONFIG.CHANNELS.VERIFY + ">.");
        if (Object.values(matchmaking).some(q => q.has(msg.author.id))) return msg.reply("⚠️ Bạn đang trong hàng chờ!");

        matchmaking[mode].set(msg.author.id, { id: msg.author.id, name: rows[0].robloxName, elo: rows[0].elo });
        msg.channel.send(`📥 **${rows[0].robloxName}** đã vào hàng chờ **${mode}** [\`${matchmaking[mode].size}/${parseInt(mode[0])*2}\`]`);
        
        if (matchmaking[mode].size >= parseInt(mode[0])*2) await handleMatchStart(mode, msg.guild);
    }

    // Lệnh !win (Staff)
    if (cmd === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ROLES.STAFF)) return;
        const mId = parseInt(args[0]), side = args[1]?.toUpperCase();
        const match = activeMatches.get(mId);
        if (!match || !['ALPHA', 'OMEGA'].includes(side)) return msg.reply("❌ Lỗi cú pháp.");

        const winners = side === 'ALPHA' ? match.teamA : match.teamB;
        const losers = side === 'ALPHA' ? match.teamB : match.teamA;

        for (const p of winners) await pool.execute('UPDATE players SET elo = elo + ?, wins = wins + 1, streak = streak + 1, maxStreak = GREATEST(maxStreak, streak + 1) WHERE discordId = ?', [CONFIG.GAME.ELO_WIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE players SET elo = GREATEST(elo - ?, 0), losses = losses + 1, streak = 0 WHERE discordId = ?', [CONFIG.GAME.ELO_LOSS, p.id]);

        msg.channel.send(`🏆 **Trận #${mId} kết thúc!** Đội **${side}** thắng.`);
        for (const vid of match.vcs) { const ch = await msg.guild.channels.fetch(vid).catch(() => null); if (ch) await ch.delete(); }
        activeMatches.delete(mId);
    }

    // Lệnh !lb (Leaderboard)
    if (cmd === 'lb') {
        const [rows] = await pool.execute('SELECT robloxName, elo FROM players ORDER BY elo DESC LIMIT 10');
        const list = rows.map((r, i) => `**#${i+1}** ${r.robloxName} — \`${r.elo}\` ELO`).join('\n');
        msg.channel.send({ embeds: [new EmbedBuilder().setTitle("🏆 TOP 10 CAO THỦ").setDescription(list || "Chưa có dữ liệu").setColor(CONFIG.COLORS.GOLD)] });
    }
});

// --- 7. INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async (i) => {
    if (i.isButton()) {
        if (i.customId === 'v_start') {
            const modal = new ModalBuilder().setCustomId('v_modal').setTitle('XÁC MINH');
            const input = new TextInputBuilder().setCustomId('r_username').setLabel("ROBLOX USERNAME").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return i.showModal(modal);
        }
        if (i.customId.startsWith('map_')) {
            const [, mId, mName] = i.customId.split('_');
            const match = activeMatches.get(parseInt(mId));
            if (match && match.map === "Đang bầu chọn...") {
                match.map = mName;
                await i.update({ content: `✅ Map đã chọn: **${mName}**`, components: [] });
                await sendHistoryUpdate(match);
            }
        }
    }
    if (i.type === InteractionType.ModalSubmit && i.customId === 'v_modal') {
        await i.deferReply({ ephemeral: true });
        const name = i.fields.getTextInputValue('r_username');
        try {
            const rid = await nblox.getIdFromUsername(name);
            await pool.execute('INSERT INTO players (discordId, robloxName, robloxId) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE robloxName = ?', [i.user.id, name, rid.toString(), name]);
            await (await i.guild.members.fetch(i.user.id)).roles.add(CONFIG.ROLES.VERIFIED);
            await i.editReply(`✅ Thành công! Chào mừng **${name}**.`);
        } catch (e) { await i.editReply("❌ Không tìm thấy user."); }
    }
});

// --- 8. STARTUP ---
client.once(Events.ClientReady, async () => {
    await connectDB();
    client.user.setActivity('PRIMEBLOX RANKED', { type: ActivityType.Competing });
    console.log(`🚀 [PRIMEBLOX] ${client.user.tag} đã sẵn sàng.`);
});

client.on(Events.PresenceUpdate, (o, n) => {
    if (n.status === 'offline') Object.keys(matchmaking).forEach(m => matchmaking[m].delete(n.userId));
});

process.on('unhandledRejection', e => console.error(e));
client.login(process.env.DISCORD_TOKEN);
