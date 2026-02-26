/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V13.9.3 - GRANDMASTER EDITION
 * 📋 FEATURES: AUTO-VERIFY, PRO DM, HISTORY, STREAK, ADVANCED LOGS
 * 📏 LENGTH: ~350 LINES
 * ===========================================================================
 */

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, PermissionsBitField, ChannelType,
    Partials, ActivityType, Collection
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// --- CONFIGURATION ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799",
    LB_CHANNEL_ID: "1474674662792232981", 
    HISTORY_CHANNEL_ID: "1476233898500292740",
    CATEGORY_VOICE_ID: "1476182203653161061",
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg",
    MAPS: ["Dust 2", "Mirage", "Inferno", "Cache", "Overpass", "Train", "Nuke"],
    COLOR: { SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, GOLD: 0xf1c40f, PURPLE: 0x9b59b6 },
    ELO: { GAIN: 25, LOSS: 20 }
};

let pool;
const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = new Collection();
const teamNames = ["TITAN", "DIRE", "ALPHA", "OMEGA", "RADIANT", "STORM", "PHOENIX", "SHADOW"];

// --- DATABASE INITIALIZATION ---
async function initDB() {
    try {
        pool = mysql.createPool({ 
            uri: process.env.DATABASE_URL, 
            ssl: { rejectUnauthorized: false }, 
            waitForConnections: true, 
            connectionLimit: 20 
        });
        console.log("✅ [DB] Connected to MySQL.");
        
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                discordId VARCHAR(25) PRIMARY KEY,
                robloxName VARCHAR(50),
                robloxId VARCHAR(25),
                elo INT DEFAULT 1000,
                wins INT DEFAULT 0,
                losses INT DEFAULT 0,
                streak INT DEFAULT 0
            )
        `);
    } catch (e) { console.error("❌ [DB] Error:", e); }
}

// --- UTILITIES ---
function getRankTier(elo) {
    if (elo >= 2500) return "🔱 GRANDMASTER";
    if (elo >= 2000) return "💎 DIAMOND";
    if (elo >= 1500) return "🛡️ PLATINUM";
    if (elo >= 1000) return "⚔️ GOLD";
    return "🎗️ SILVER";
}

async function sendLog(title, desc, color = CONFIG.COLOR.INFO) {
    const logChan = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
    if (!logChan) return;
    const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
    logChan.send({ embeds: [embed] });
}

async function updateLeaderboard() {
    try {
        const channel = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        const [top] = await pool.execute('SELECT robloxName, elo, wins, losses, streak FROM users ORDER BY elo DESC LIMIT 10');
        
        const lbEntries = top.map((u, i) => {
            const streakIcon = u.streak >= 3 ? "🔥" : (u.streak <= -3 ? "❄️" : "");
            return `**#${i+1}** ${u.robloxName} ${streakIcon}\n┗ ELO: \`${u.elo}\` | ${u.wins}W - ${u.losses}L | *${getRankTier(u.elo)}*`;
        });

        const embed = new EmbedBuilder()
            .setTitle("🏆 PRIMEBLOX TOP GLADIATORS")
            .setThumbnail(client.user.displayAvatarURL())
            .setDescription(lbEntries.join('\n\n') || "Hệ thống đang chờ dữ liệu người chơi...")
            .setColor(CONFIG.COLOR.GOLD)
            .setFooter({ text: "Tự động cập nhật mỗi khi trận đấu kết thúc" });
        
        const msgs = await channel.messages.fetch({ limit: 10 });
        const botMsg = msgs.find(m => m.author.id === client.user.id);
        if (botMsg) await botMsg.edit({ embeds: [embed] }); 
        else await channel.send({ embeds: [embed] });
    } catch (err) { console.log("Leaderboard Update Fail"); }
}

// --- CORE EVENTS ---
client.on('ready', async () => {
    await initDB();
    client.user.setActivity('Ranked V13.9.3', { type: ActivityType.Watching });
    updateLeaderboard();

    // Auto-Setup Verify Channel
    const vChan = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID).catch(() => null);
    if (vChan) {
        const old = await vChan.messages.fetch({ limit: 10 });
        await vChan.bulkDelete(old.filter(m => m.author.id === client.user.id)).catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle("🛡️ PRIMEBLOX SECURITY SYSTEM")
            .setDescription("Chào mừng chiến binh! Hệ thống yêu cầu xác minh để tham gia hàng chờ Rank.\n\n**Tại sao phải xác minh?**\n• Để đồng bộ hóa ELO với Roblox.\n• Ngăn chặn tài khoản giả mạo.\n• Theo dõi lịch sử đấu.")
            .addFields(
                { name: "✅ Bước 1", value: "Nhấn nút 'Xác Minh' bên dưới.", inline: true },
                { name: "📝 Bước 2", value: "Nhập đúng Username Roblox.", inline: true }
            )
            .setImage(CONFIG.BANNER_URL)
            .setColor(CONFIG.COLOR.PURPLE);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_start').setLabel('Xác Minh').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('v_unlink').setLabel('Hủy Liên Kết').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
        );
        vChan.send({ embeds: [embed], components: [row] });
    }
    console.log(`🚀 ${client.user.tag} is online and fully functional.`);
});

// --- COMMAND HANDLER ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // LỆNH JOIN
    if (cmd === 'j' || cmd === 'join') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("❌ Cú pháp: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");
        
        const [u] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!u[0]) return msg.reply("❌ Bạn chưa xác minh! Hãy vào <#" + CONFIG.VERIFY_CHANNEL_ID + ">.");
        
        if (Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id))) {
            return msg.reply("⚠️ Bạn đã có tên trong một hàng chờ khác.");
        }

        queues[mode].players.push({ id: msg.author.id, name: u[0].robloxName, elo: u[0].elo });
        msg.channel.send(`📥 **${u[0].robloxName}** (\`${u[0].elo}\`) đã vào hàng chờ **${mode}** [${queues[mode].players.length}/${queues[mode].limit}]`);

        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players]; 
            queues[mode].players = [];
            const mId = Math.floor(100000 + Math.random() * 899999);
            const map = CONFIG.MAPS[Math.floor(Math.random() * CONFIG.MAPS.length)];
            const tNames = teamNames.sort(() => 0.5 - Math.random());
            
            // Logic chia team
            const t1 = players.slice(0, players.length / 2);
            const t2 = players.slice(players.length / 2);

            // Tạo Voice Channels
            const vc1 = await msg.guild.channels.create({ name: `🔊 ${tNames[0]} [#${mId}]`, type: ChannelType.GuildVoice, parent: CONFIG.CATEGORY_VOICE_ID });
            const vc2 = await msg.guild.channels.create({ name: `🔊 ${tNames[1]} [#${mId}]`, type: ChannelType.GuildVoice, parent: CONFIG.CATEGORY_VOICE_ID });

            activeMatches.set(mId, { id: mId, map, t1P: t1, t1N: tNames[0], t2P: t2, t2N: tNames[1], v: [vc1.id, vc2.id] });

            const matchEmbed = new EmbedBuilder()
                .setTitle(`⚔️ TRẬN ĐẤU MỚI: #${mId}`)
                .addFields(
                    { name: `🟦 Đội ${tNames[0]}`, value: t1.map(p => `• ${p.name} (\`${p.elo}\`)`).join('\n'), inline: true },
                    { name: `🟥 Đội ${tNames[1]}`, value: t2.map(p => `• ${p.name} (\`${p.elo}\`)`).join('\n'), inline: true },
                    { name: "🗺️ Bản Đồ", value: `**${map}**` }
                )
                .setColor(CONFIG.COLOR.GOLD).setImage(CONFIG.BANNER_URL);

            msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

            // Thông báo DM cho từng người
            const startDM = new EmbedBuilder()
                .setTitle("🎮 TRẬN ĐẤU BẮT ĐẦU!")
                .setDescription(`Trận đấu **#${mId}** của bạn đã sẵn sàng.`)
                .addFields({ name: "🔗 Link VIP Server", value: `[Bấm vào để tham gia ngay](${CONFIG.VIP_LINK})` })
                .setColor(CONFIG.COLOR.SUCCESS).setFooter({ text: "Chúc bạn thi đấu tốt!" });

            players.forEach(async p => {
                const member = await msg.guild.members.fetch(p.id).catch(() => null);
                if (member) {
                    if (member.voice.channel) member.voice.setChannel(t1.includes(p) ? vc1 : vc2).catch(() => {});
                    member.send({ embeds: [startDM] }).catch(() => {});
                }
            });
            sendLog("MATCH CREATED", `Trận #${mId} (Chế độ: ${mode}) đã bắt đầu tại map ${map}.`);
        }
    }

    // LỆNH WIN (ADMIN)
    if (cmd === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const side = args[1]?.toUpperCase();
        const match = activeMatches.get(mId);

        if (!match) return msg.reply("❌ Không tìm thấy trận đấu ID này.");
        if (side !== match.t1N && side !== match.t2N) return msg.reply(`❌ Team thắng phải là **${match.t1N}** hoặc **${match.t2N}**.`);

        const winners = (side === match.t1N) ? match.t1P : match.t2P;
        const losers = (side === match.t1N) ? match.t2P : match.t1P;

        // Cập nhật Database
        for (const p of winners) await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1, streak = IF(streak < 0, 1, streak + 1) WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1, streak = IF(streak > 0, -1, streak - 1) WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);

        // Gửi History (Không tag)
        const historyEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU KẾT THÚC: #${mId}`)
            .addFields(
                { name: "🏆 CHIẾN THẮNG", value: `Đội **${side}**`, inline: true },
                { name: "🗺️ Bản Đồ", value: match.map, inline: true },
                { name: "👥 Người chơi thắng", value: winners.map(p => p.name).join(', ') }
            )
            .setColor(CONFIG.COLOR.GOLD).setTimestamp();
        
        const hChan = await client.channels.fetch(CONFIG.HISTORY_CHANNEL_ID).catch(() => null);
        if (hChan) hChan.send({ embeds: [historyEmbed] });

        // Gửi DM kết quả
        const winEmbed = new EmbedBuilder().setTitle("🏆 CHIẾN THẮNG!").setDescription(`Bạn thắng trận #${mId}!\nELO: \`+${CONFIG.ELO.GAIN}\``).setColor(CONFIG.COLOR.SUCCESS);
        const lossEmbed = new EmbedBuilder().setTitle("💀 THẤT BẠI").setDescription(`Bạn thua trận #${mId}!\nELO: \`-${CONFIG.ELO.LOSS}\``).setColor(CONFIG.COLOR.ERROR);

        winners.forEach(async p => { const m = await msg.guild.members.fetch(p.id).catch(() => null); if(m) m.send({ embeds: [winEmbed] }).catch(() => {}); });
        losers.forEach(async p => { const m = await msg.guild.members.fetch(p.id).catch(() => null); if(m) m.send({ embeds: [lossEmbed] }).catch(() => {}); });

        // Xóa Voice
        setTimeout(async () => {
            for (const vid of match.v) {
                const c = await msg.guild.channels.fetch(vid).catch(() => null);
                if (c) await c.delete();
            }
        }, 3000);

        activeMatches.delete(mId);
        updateLeaderboard();
        msg.reply(`✅ Đã ghi nhận chiến thắng cho đội **${side}**.`);
        sendLog("MATCH FINISHED", `Trận #${mId} đã kết thúc. Đội ${side} thắng.`, CONFIG.COLOR.SUCCESS);
    }

    // LỆNH PROFILE
    if (cmd === 'p' || cmd === 'profile') {
        const target = msg.mentions.users.first() || msg.author;
        const [u] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [target.id]);
        if (!u[0]) return msg.reply("Người dùng này chưa xác minh.");

        const winRate = ((u[0].wins / (u[0].wins + u[0].losses || 1)) * 100).toFixed(1);
        const profileEmbed = new EmbedBuilder()
            .setTitle(`📊 PROFILE: ${u[0].robloxName}`)
            .setColor(CONFIG.COLOR.INFO)
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${u[0].robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: "🔱 Rank", value: getRankTier(u[0].elo), inline: true },
                { name: "📈 ELO", value: `\`${u[0].elo}\``, inline: true },
                { name: "🔥 Streak", value: `\`${u[0].streak}\``, inline: true },
                { name: "🏆 Thắng/Thua", value: `${u[0].wins}W / ${u[0].losses}L`, inline: true },
                { name: "🎯 Tỉ lệ thắng", value: `${winRate}%`, inline: true }
            );
        msg.reply({ embeds: [profileEmbed] });
    }
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        if (i.customId === 'v_start') {
            const modal = new ModalBuilder().setCustomId('mod_v').setTitle('XÁC MINH ROBLOX');
            const input = new TextInputBuilder().setCustomId('r_name').setLabel("Nhập Username Roblox của bạn").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }
        if (i.customId === 'v_unlink') {
            await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
            i.reply({ content: "🗑️ Đã xóa dữ liệu liên kết của bạn.", ephemeral: true });
        }
    }

    if (i.type === InteractionType.ModalSubmit) {
        await i.deferReply({ ephemeral: true });
        const name = i.fields.getTextInputValue('r_name');
        try {
            const rid = await nblox.getIdFromUsername(name);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo) VALUES (?, ?, ?, 1000) ON DUPLICATE KEY UPDATE robloxName = ?', [i.user.id, name, rid.toString(), name]);
            await i.editReply(`✅ Xác minh thành công tài khoản: **${name}** (ID: ${rid})`);
            updateLeaderboard();
            sendLog("USER VERIFIED", `Người dùng <@${i.user.id}> đã liên kết với Roblox: \`${name}\``);
        } catch (e) {
            await i.editReply("❌ Không tìm thấy tài khoản Roblox này. Vui lòng kiểm tra lại tên.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
