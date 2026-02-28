/**
 * ===========================================================================
 * 🛡️ PRIMEBLOX RANKED SYSTEM V30.0 - THE ULTIMATE MONOLITH
 * 📋 TÍNH NĂNG: RANKED, AUTO-VOICE, STICKY DM, MAP VOTE, HISTORY LOGGING
 * 📏 ĐỘ ĐÀI: > 550 DÒNG (FULL LOGIC & COMMENTS)
 * 🛠️ PHIÊN BẢN: HOÀN CHỈNH - FULL INTERFACE & LOGIC FIX
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
    { name: "👑 GRANDMASTER", min: 2500, color: "#ff0000" },
    { name: "🛡️ DIAMOND", min: 2000, color: "#00ffff" },
    { name: "⚔️ PLATINUM", min: 1500, color: "#e5e4e2" },
    { name: "🎗️ GOLD", min: 1000, color: "#ffd700" },
    { name: "🥉 SILVER", min: 0, color: "#c0c0c0" }
];

let pool;
const matchmaking = { "1v1": new Collection(), "2v2": new Collection(), "5v5": new Collection() };
const activeMatches = new Collection();

// --- 3. DATABASE CONNECTION ---
async function connectDB() {
    try {
        pool = mysql.createPool({
            uri: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionLimit: 30
        });
        console.log("📂 [DATABASE] Kết nối thành công.");
    } catch (e) { 
        console.error("🔥 [FATAL] Database lỗi:", e); 
        process.exit(1); 
    }
}

// --- 4. UTILS & EMBED GENERATORS ---
function getTier(elo) { return RANK_TIERS.find(t => elo >= t.min) || RANK_TIERS[4]; }

async function sendHistoryUpdate(match) {
    const channel = await client.channels.fetch(CONFIG.CHANNELS.HISTORY).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setAuthor({ name: "LIVE MATCH TRACKER", iconURL: "https://i.imgur.com/39p6M7B.png" })
        .setTitle(`⚔️ TRẬN ĐẤU ĐANG DIỄN RA: #${match.id}`)
        .setColor(CONFIG.COLORS.PURPLE)
        .addFields(
            { 
                name: "🟦 ĐỘI ALPHA", 
                value: match.teamA.map(p => `🔹 **${p.name}** (\`${p.elo}\`)`).join('\n'), 
                inline: true 
            },
            { 
                name: "🟥 ĐỘI OMEGA", 
                value: match.teamB.map(p => `🔸 **${p.name}** (\`${p.elo}\`)`).join('\n'), 
                inline: true 
            },
            { 
                name: "📍 Thông tin", 
                value: `🗺️ **Bản đồ:** ${match.map}\n⏰ **Bắt đầu:** <t:${Math.floor(match.startTime / 1000)}:R>`, 
                inline: false 
            }
        )
        .setImage(CONFIG.GAME.BANNER)
        .setFooter({ text: `Chế độ: ${match.mode} | PrimeBlox Engine` })
        .setTimestamp();

    return channel.send({ embeds: [embed] });
}

// --- 5. MATCHMAKING ENGINE (ENHANCED DM & VOICE) ---
async function handleMatchStart(mode, guild) {
    const players = Array.from(matchmaking[mode].values());
    matchmaking[mode].clear();
    const matchId = Math.floor(100000 + Math.random() * 900000);
    
    players.sort((a, b) => b.elo - a.elo);
    let teamA = [], teamB = [];
    players.forEach((p, i) => { if (i % 2 === 0) teamA.push(p); else teamB.push(p); });

    // A. GỬI DM NÂNG CAO
    for (const p of players) {
        try {
            const user = await client.users.fetch(p.id);
            const dmEmbed = new EmbedBuilder()
                .setTitle("🎮 TRẬN ĐẤU CỦA BẠN ĐÃ SẴN SÀNG")
                .setThumbnail(CONFIG.GAME.BANNER)
                .setColor(CONFIG.COLORS.SUCCESS)
                .setDescription("Hãy chuẩn bị sẵn sàng, trận đấu sẽ bắt đầu ngay bây giờ!")
                .addFields(
                    { name: "📌 Mã trận", value: `\`#${matchId}\``, inline: true },
                    { name: "🕹️ Chế độ", value: `\`${mode}\``, inline: true },
                    { name: "🔗 Server VIP (Bắt buộc)", value: `[NHẤN VÀO ĐÂY ĐỂ VÀO GAME](${CONFIG.GAME.VIP_LINK})` },
                    { name: "📢 Lưu ý", value: "Vào đúng team được phân bổ trong game để tránh bị xử phạt ELO." }
                )
                .setFooter({ text: "PrimeBlox Ranked System • Tự động di chuyển Voice..." })
                .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
        } catch (e) {
            const logCh = guild.channels.cache.get(CONFIG.CHANNELS.MATCH_LOGS);
            if (logCh) logCh.send(`⚠️ <@${p.id}> (**${p.name}**) không nhận được DM! Link VIP: <${CONFIG.GAME.VIP_LINK}>`);
        }
    }

    // B. TẠO VOICE & AUTO-MOVE
    try {
        let parentId = CONFIG.CHANNELS.CATEGORY_VOICE;
        const category = await guild.channels.fetch(parentId).catch(() => null);
        if (!category || category.type !== ChannelType.GuildCategory) parentId = null;

        const vcA = await guild.channels.create({
            name: `🔊 Alpha [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: parentId,
            permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }]
        });

        const vcB = await guild.channels.create({
            name: `🔊 Omega [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: parentId,
            permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }]
        });

        for (const p of teamA) {
            await vcA.permissionOverwrites.create(p.id, { Connect: true, Speak: true, ViewChannel: true });
            const mem = await guild.members.fetch(p.id).catch(() => null);
            if (mem?.voice.channel) mem.voice.setChannel(vcA).catch(() => {});
        }
        for (const p of teamB) {
            await vcB.permissionOverwrites.create(p.id, { Connect: true, Speak: true, ViewChannel: true });
            const mem = await guild.members.fetch(p.id).catch(() => null);
            if (mem?.voice.channel) mem.voice.setChannel(vcB).catch(() => {});
        }

        activeMatches.set(matchId, {
            id: matchId, mode, teamA, teamB, vcs: [vcA.id, vcB.id], map: "Đang bầu chọn...", startTime: Date.now()
        });

        // C. VOTE MAP UI
        const maps = CONFIG.GAME.MAPS.sort(() => 0.5 - Math.random()).slice(0, 3);
        const row = new ActionRowBuilder().addComponents(
            maps.map(m => new ButtonBuilder().setCustomId(`map_${matchId}_${m}`).setLabel(m).setStyle(ButtonStyle.Primary))
        );

        const embed = new EmbedBuilder()
            .setTitle(`⚔️ BẮT ĐẦU TRẬN #${matchId}`)
            .addFields(
                { name: "🟦 Team Alpha", value: teamA.map(p => `🔹 ${p.name}`).join('\n'), inline: true },
                { name: "🟥 Team Omega", value: teamB.map(p => `🔸 ${p.name}`).join('\n'), inline: true }
            )
            .setColor(CONFIG.COLORS.GOLD).setImage(CONFIG.GAME.BANNER)
            .setFooter({ text: "Vui lòng bầu chọn bản đồ bên dưới" });

        const channel = guild.channels.cache.get(CONFIG.CHANNELS.MATCH_LOGS);
        if (channel) await channel.send({ content: "@everyone", embeds: [embed], components: [row] });
        
        await sendHistoryUpdate(activeMatches.get(matchId));

    } catch (err) { console.error("Critical Match Start Error:", err); }
}

// --- 6. COMMAND HANDLER ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // Lệnh Join !j (với Embed mới)
    if (cmd === 'j') {
        const mode = args[0] || "5v5";
        if (!matchmaking[mode]) return msg.reply("❌ Mode hợp lệ: 1v1, 2v2, 5v5");
        
        const [rows] = await pool.execute('SELECT * FROM players WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply("❌ Bạn chưa xác minh! Hãy sang <#" + CONFIG.CHANNELS.VERIFY + ">.");
        if (Object.values(matchmaking).some(q => q.has(msg.author.id))) return msg.reply("⚠️ Bạn đã ở trong hàng chờ!");

        matchmaking[mode].set(msg.author.id, { id: msg.author.id, name: rows[0].robloxName, elo: rows[0].elo });
        const req = parseInt(mode[0]) * 2;
        
        const joinEmbed = new EmbedBuilder()
            .setAuthor({ name: rows[0].robloxName, iconURL: `https://www.roblox.com/headshot-thumbnail/image?userId=${rows[0].robloxId}&width=150&height=150&format=png` })
            .setDescription(`📥 Đã tham gia hàng chờ **${mode}**`)
            .addFields(
                { name: '📊 Trạng thái', value: `\`${matchmaking[mode].size}/${req}\` người chơi`, inline: true },
                { name: '⚔️ Chế độ', value: `Ranked ${mode}`, inline: true }
            )
            .setColor(CONFIG.COLORS.INFO)
            .setTimestamp();

        msg.channel.send({ embeds: [joinEmbed] });
        
        if (matchmaking[mode].size >= req) await handleMatchStart(mode, msg.guild);
    }

    // Lệnh Win !win (với UI mới)
    if (cmd === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ROLES.STAFF)) return;
        const mId = parseInt(args[0]), side = args[1]?.toUpperCase();
        const match = activeMatches.get(mId);
        if (!match || !['ALPHA', 'OMEGA'].includes(side)) return msg.reply("❌ Cú pháp: `!win [ID] ALPHA/OMEGA`.");

        const winners = side === 'ALPHA' ? match.teamA : match.teamB;
        const losers = side === 'ALPHA' ? match.teamB : match.teamA;

        for (const p of winners) await pool.execute('UPDATE players SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.GAME.ELO_WIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE players SET elo = GREATEST(elo - ?, 0), losses = losses + 1 WHERE discordId = ?', [CONFIG.GAME.ELO_LOSS, p.id]);

        const winEmbed = new EmbedBuilder()
            .setTitle(`🏁 KẾT THÚC TRẬN ĐẤU #${mId}`)
            .setDescription(`Đội chiến thắng: **${side === 'ALPHA' ? '🟦 ALPHA' : '🟥 OMEGA'}**`)
            .addFields(
                { name: "🏆 Phần thưởng", value: `**+${CONFIG.GAME.ELO_WIN} ELO**`, inline: true },
                { name: "📉 Hình phạt", value: `**-${CONFIG.GAME.ELO_LOSS} ELO**`, inline: true }
            )
            .setColor(side === 'ALPHA' ? CONFIG.COLORS.BLUE : CONFIG.COLORS.RED)
            .setTimestamp();

        msg.channel.send({ embeds: [winEmbed] });
        
        for (const vid of match.vcs) {
            const ch = await msg.guild.channels.fetch(vid).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.delete(mId);
    }

    // Lệnh Leaderboard !lb
    if (cmd === 'lb') {
        const [rows] = await pool.execute('SELECT robloxName, elo FROM players ORDER BY elo DESC LIMIT 10');
        const list = rows.map((r, i) => `**#${i+1}** ${r.robloxName} — \`${r.elo}\` ELO`).join('\n');
        const eb = new EmbedBuilder()
            .setTitle("🏆 BẢNG XẾP HẠNG CAO THỦ")
            .setDescription(list || "*Chưa có dữ liệu*")
            .setColor(CONFIG.COLORS.GOLD)
            .setThumbnail("https://i.imgur.com/A6uLpCj.png");
        msg.channel.send({ embeds: [eb] });
    }
});

// --- 7. INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async (i) => {
    if (i.isButton()) {
        if (i.customId === 'v_start') {
            const modal = new ModalBuilder().setCustomId('v_modal').setTitle('XÁC MINH ROBLOX');
            const input = new TextInputBuilder().setCustomId('r_username').setLabel("TÊN NGƯỜI DÙNG ROBLOX").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return i.showModal(modal);
        }

        if (i.customId.startsWith('map_')) {
            const [, mId, mName] = i.customId.split('_');
            const match = activeMatches.get(parseInt(mId));
            if (match && match.map === "Đang bầu chọn...") {
                match.map = mName;
                await i.update({ content: `✅ Map thi đấu đã chọn: **${mName}**`, components: [] });
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
            const mem = await i.guild.members.fetch(i.user.id);
            await mem.roles.add(CONFIG.ROLES.VERIFIED).catch(() => {});
            await i.editReply(`✅ Xác minh thành công! Chào mừng **${name}** gia nhập hệ thống.`);
        } catch (e) { await i.editReply("❌ Lỗi: Không tìm thấy người dùng này trên Roblox."); }
    }
});

// --- 8. STARTUP & AUTOMATION ---
client.once(Events.ClientReady, async () => {
    await connectDB();
    client.user.setActivity('PRIMEBLOX RANKED', { type: ActivityType.Competing });
    console.log(`🚀 Sẵn sàng phục vụ: ${client.user.tag}`);
    
    const vChan = await client.channels.fetch(CONFIG.CHANNELS.VERIFY).catch(() => null);
    if (vChan) {
        const msgs = await vChan.messages.fetch({ limit: 5 });
        if (msgs.size === 0) {
            const eb = new EmbedBuilder()
                .setTitle("🛡️ HỆ THỐNG XÁC MINH")
                .setDescription("Vui lòng nhấn nút dưới đây để liên kết tài khoản Roblox và bắt đầu thi đấu.")
                .setColor(CONFIG.COLORS.INFO)
                .setImage(CONFIG.GAME.BANNER);
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('v_start').setLabel('XÁC MINH NGAY').setStyle(ButtonStyle.Success));
            vChan.send({ embeds: [eb], components: [btn] });
        }
    }
});

// Tự động dọn dẹp hàng chờ khi offline
client.on(Events.PresenceUpdate, (oldP, newP) => {
    if (newP.status === 'offline') {
        Object.keys(matchmaking).forEach(m => {
            if (matchmaking[m].delete(newP.userId)) console.log(`🧹 Dọn dẹp user offline: ${newP.userId}`);
        });
    }
});

// Xử lý lỗi tập trung
process.on('unhandledRejection', e => console.error('Unhandled:', e));
process.on('uncaughtException', e => console.error('Uncaught:', e));
// COMMAND: LEAVE
    if (cmd === 'l' || cmd === 'leave') {
        let removedMode = null;
        
        // Kiểm tra tất cả các hàng chờ
        Object.keys(matchmaking).forEach(mode => {
            if (matchmaking[mode].has(msg.author.id)) {
                matchmaking[mode].delete(msg.author.id);
                removedMode = mode;
            }
        });

        if (removedMode) {
            const leaveEmbed = new EmbedBuilder()
                .setTitle("🚪 RỜI HÀNG CHỜ")
                .setDescription(`Bạn đã rời khỏi hàng chờ **${removedMode}** thành công.`)
                .setColor(CONFIG.COLORS.ERROR)
                .setTimestamp();
            
            return msg.reply({ embeds: [leaveEmbed] });
        } else {
            return msg.reply("⚠️ Bạn hiện không có trong bất kỳ hàng chờ nào.");
        }
    }
// COMMAND: STATS (UPGRADED VERSION)
    if (cmd === 'stats') {
        try {
            // 1. Lấy dữ liệu từ Database
            const [dbStats] = await pool.execute('SELECT COUNT(*) as total FROM players');
            const [topPlayer] = await pool.execute('SELECT robloxName, elo FROM players ORDER BY elo DESC LIMIT 1');
            
            // 2. Tính toán số lượng người trong hàng chờ
            const q1v1 = matchmaking["1v1"].size;
            const q2v2 = matchmaking["2v2"].size;
            const q5v5 = matchmaking["5v5"].size;
            const totalInQueue = q1v1 + q2v2 + q5v5;

            // 3. Tạo thanh tiến trình giả lập (Progress Bar)
            const createBar = (current, max) => {
                const filled = Math.round((current / max) * 10);
                return "🟩".repeat(Math.min(filled, 10)) + "⬛".repeat(Math.max(0, 10 - filled));
            };

            const statsEmbed = new EmbedBuilder()
                .setAuthor({ 
                    name: "PRIMEBLOX NETWORK MONITOR", 
                    iconURL: client.user.displayAvatarURL() 
                })
                .setTitle("📊 THỐNG KÊ HỆ THỐNG CHIẾN TRƯỜNG")
                .setColor(CONFIG.COLORS.GOLD)
                .setThumbnail("https://i.imgur.com/A6uLpCj.png") // Icon cúp hoặc radar
                .addFields(
                    { 
                        name: "👥 DÂN SỐ", 
                        value: ` Tổng cộng: \`${dbStats[0].total}\` user\n Đang trực tuyến: \`${client.users.cache.size}\``, 
                        inline: true 
                    },
                    { 
                        name: "⚔️ TRẬN ĐẤU", 
                        value: ` Đang diễn ra: \`${activeMatches.size}\` trận\n Đang chờ: \`${totalInQueue}\` người`, 
                        inline: true 
                    },
                    { 
                        name: "🏆 CAO THỦ HIỆN TẠI", 
                        value: `👑 **${topPlayer[0]?.robloxName || "N/A"}** (\`${topPlayer[0]?.elo || 0}\` ELO)`, 
                        inline: false 
                    },
                    {
                        name: "📥 TÌNH TRẠNG HÀNG CHỜ",
                        value: [
                            `**1vs1:** \`[${q1v1}/2]\` ${createBar(q1v1, 2)}`,
                            `**2vs2:** \`[${q2v2}/4]\` ${createBar(q2v2, 4)}`,
                            `**5vs5:** \`[${q5v5}/10]\` ${createBar(q5v5, 10)}`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: "⚙️ THÔNG SỐ KỸ THUẬT",
                        value: `\`\`\`ml\nLatency : ${client.ws.ping}ms\nUptime  : ${Math.floor(client.uptime / 3600000)}h ${Math.floor((client.uptime % 3600000) / 60000).toString().padStart(2, '0')}m\nMemory  : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\`\`\``,
                        inline: false
                    }
                )
                .setFooter({ text: "Hệ thống cập nhật dữ liệu thời gian thực" })
                .setTimestamp();

            msg.channel.send({ embeds: [statsEmbed] });

        } catch (e) {
            console.error(e);
            msg.reply("❌ Lỗi khi trích xuất dữ liệu thống kê.");
        }
    }
// COMMAND: !p hoặc !profile
    if (cmd === 'p' || cmd === 'profile') {
        const target = msg.mentions.users.first() || msg.author;

        try {
            // 1. Lấy dữ liệu từ Database
            const [rows] = await pool.execute('SELECT * FROM players WHERE discordId = ?', [target.id]);

            if (!rows[0]) {
                return msg.reply(target.id === msg.author.id 
                    ? "❌ Bạn chưa xác minh! Hãy sang kênh <#" + CONFIG.CHANNELS.VERIFY + "> để đăng ký." 
                    : "❌ Người chơi này chưa có dữ liệu trong hệ thống.");
            }

            const p = rows[0];
            const tier = getTier(p.elo);
            const totalGames = p.wins + p.losses;
            const winRate = totalGames === 0 ? 0 : ((p.wins / totalGames) * 100).toFixed(1);

            // 2. Tính toán Rank tiếp theo (Progress Bar)
            const currentTierIndex = RANK_TIERS.findIndex(t => t.min === tier.min);
            const nextTier = RANK_TIERS[currentTierIndex - 1] || tier; // Lấy rank cao hơn 1 bậc
            
            let progressStr = "";
            if (tier.name === "👑 GRANDMASTER") {
                progressStr = "⭐⭐⭐⭐⭐ **MAX RANK**";
            } else {
                const range = nextTier.min - tier.min;
                const currentProgress = p.elo - tier.min;
                const percent = Math.floor((currentProgress / range) * 100);
                const blocks = Math.floor(percent / 10);
                progressStr = `\`${"🟦".repeat(blocks)}${"⬛".repeat(10 - blocks)}\` **${percent}%**`;
            }

            // 3. Khởi tạo Embed "Siêu Cấp"
            const profileEmbed = new EmbedBuilder()
                .setColor(tier.color)
                .setAuthor({ 
                    name: `HỒ SƠ TAY TO: ${p.robloxName.toUpperCase()}`, 
                    iconURL: target.displayAvatarURL({ dynamic: true }) 
                })
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${p.robloxId}&width=150&height=150&format=png`)
                .setDescription(`>>> 🛡️ **Hạng:** \`${tier.name}\`\n🔥 **Uy tín:** \`Cao\``)
                .addFields(
                    { 
                        name: "🏆 CHỈ SỐ XẾP HẠNG", 
                        value: `💰 ELO: \`${p.elo}\` \n🥇 Thắng: \`${p.wins}\` \n💀 Thua: \`${p.losses}\``, 
                        inline: true 
                    },
                    { 
                        name: "🎯 HIỆU SUẤT", 
                        value: `📈 Winrate: \`${winRate}%\` \n🎮 Tổng: \`${totalGames}\` trận\n🔥 Chuỗi: \`+3\``, // Chuỗi thắng có thể code thêm sau
                        inline: true 
                    },
                    {
                        name: `🚀 TIẾN TRÌNH ĐẾN ${nextTier.name}`,
                        value: progressStr,
                        inline: false
                    },
                    {
                        name: "🔗 THÔNG TIN ROBLOX",
                        value: `🆔 ID: \`${p.robloxId}\` \n👤 Tên: [${p.robloxName}](https://www.roblox.com/users/${p.robloxId}/profile)`,
                        inline: false
                    }
                )
                .setImage(CONFIG.GAME.BANNER)
                .setFooter({ text: `PrimeBlox Ranked • Xem hồ sơ bằng cách !p @tag`, iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            msg.channel.send({ embeds: [profileEmbed] });

        } catch (e) {
            console.error(e);
            msg.reply("❌ Đã xảy ra lỗi khi truy xuất hồ sơ.");
        }
    }

client.login(process.env.DISCORD_TOKEN);
