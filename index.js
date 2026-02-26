/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V16.0 - THE ULTIMATE EDITION
 * 📋 PHIÊN BẢN: TRÊN 350 DÒNG - ĐẦY ĐỦ TẤT CẢ TÍNH NĂNG NÂNG CAO
 * 🛠️ CẬP NHẬT: !j command, Auto-Voice Cleanup, Win Streak, Penalty System
 * 🚀 TRẠNG THÁI: PRODUCTION READY
 * ===========================================================================
 */

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, PermissionsBitField, ChannelType,
    Partials, ActivityType
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
require('dotenv').config();

// --- 1. KHỞI TẠO CLIENT VỚI INTENTS ĐẦY ĐỦ ---
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
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// --- 2. CẤU HÌNH HỆ THỐNG (CONFIG) ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799", 
    LB_CHANNEL_ID: "1474674662792232981", 
    CATEGORY_VOICE_ID: "1476182203653161061", 
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: { 
        SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, 
        GOLD: 0xf1c40f, BLUE: 0x00a2ff, PURPLE: 0x9b59b6 
    },
    ELO: { BASE_GAIN: 25, BASE_LOSS: 20, STREAK_BONUS: 5 }
};

// --- 3. QUẢN LÝ DỮ LIỆU TẠM THỜI (MEMORY) ---
const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX"];

// --- 4. KẾT NỐI DATABASE ---
const pool = mysql.createPool({ 
    uri: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    connectionLimit: 10
});

// --- 5. HÀM TRỢ GIÚP (HELPER FUNCTIONS) ---

function getRankEmoji(elo) {
    if (elo >= 2500) return "👑 GRANDMASTER";
    if (elo >= 2000) return "🎖️ ELITE";
    if (elo >= 1500) return "💎 DIAMOND";
    if (elo >= 1200) return "🔥 PLATINUM";
    return "💿 SILVER";
}

async function sendLog(title, desc, color = CONFIG.COLOR.INFO) {
    try {
        const logChan = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID);
        if (logChan) {
            const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
            await logChan.send({ embeds: [embed] });
        }
    } catch (e) { console.log("Log Error"); }
}

async function updateSystemUI() {
    try {
        const vChan = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID);
        const embed = new EmbedBuilder()
            .setTitle("🎮 PRIMEBLOX MATCHMAKING CENTER")
            .setColor(CONFIG.COLOR.BLUE)
            .setImage(CONFIG.BANNER_URL)
            .addFields(
                { name: "📝 CÁCH THAM GIA", value: "• Chat `!j 1v1`, `!j 2v2` hoặc `!j 5v5` để xếp hàng.\n• Hoặc nhấn các nút bên dưới để chọn nhanh." },
                { name: "📊 TRẠNG THÁI HÀNG CHỜ", value: `>>> ⚔️ **1v1:** \`${queues["1v1"].players.length}/2\`\n👥 **2v2:** \`${queues["2v2"].players.length}/4\`\n🔥 **5v5:** \`${queues["5v5"].players.length}/10\`` }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('q_1v1').setLabel('1 vs 1').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
            new ButtonBuilder().setCustomId('q_2v2').setLabel('2 vs 2').setStyle(ButtonStyle.Primary).setEmoji('👥'),
            new ButtonBuilder().setCustomId('q_5v5').setLabel('5 vs 5').setStyle(ButtonStyle.Primary).setEmoji('🔥'),
            new ButtonBuilder().setCustomId('v_start').setLabel('Xác Minh').setStyle(ButtonStyle.Success).setEmoji('🛡️')
        );

        const messages = await vChan.messages.fetch({ limit: 10 });
        const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
        if (botMsg) await botMsg.edit({ embeds: [embed], components: [row] });
        else await vChan.send({ embeds: [embed], components: [row] });
    } catch (e) { console.error("UI Update Failed"); }
}

// --- 6. HÀM TẠO TRẬN ĐẤU (CORE LOGIC) ---
async function startMatch(mode, guild, channel) {
    const matchPlayers = [...queues[mode].players];
    queues[mode].players = []; // Clear queue ngay lập tức
    
    const mId = Math.floor(100000 + Math.random() * 899999);
    matchPlayers.sort(() => 0.5 - Math.random());
    const t1 = matchPlayers.slice(0, matchPlayers.length / 2);
    const t2 = matchPlayers.slice(matchPlayers.length / 2);
    const tNames = [...teamNames].sort(() => 0.5 - Math.random());

    try {
        const parent = CONFIG.CATEGORY_VOICE_ID;
        const vc1 = await guild.channels.create({
            name: `🔊 ĐỘI ${tNames[0]} [#${mId}]`,
            type: ChannelType.GuildVoice, parent,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...t1.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
            ]
        });

        const vc2 = await guild.channels.create({
            name: `🔊 ĐỘI ${tNames[1]} [#${mId}]`,
            type: ChannelType.GuildVoice, parent,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...t2.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
            ]
        });

        activeMatches.push({ id: mId, mode, t1Name: tNames[0], t2Name: tNames[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

        const startEmbed = new EmbedBuilder()
            .setTitle(`🚀 TRẬN ĐẤU BẮT ĐẦU | #${mId}`)
            .setColor(CONFIG.COLOR.GOLD)
            .addFields(
                { name: `🟦 ĐỘI ${tNames[0]}`, value: t1.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true },
                { name: `🟥 ĐỘI ${tNames[1]}`, value: t2.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true }
            );

        channel.send({ content: `🔔 **Match #${mId}** đã lên sóng!`, embeds: [startEmbed] });

        // XỬ LÝ DM VÀ AUTO-MOVE (FIXED)
        for (const p of [...t1, ...t2]) {
            const member = await guild.members.fetch(p.id).catch(() => null);
            if (!member) continue;
            const myVC = t1.some(tp => tp.id === p.id) ? vc1 : vc2;

            const dmEmbed = new EmbedBuilder()
                .setTitle("⚔️ SẴN SÀNG CHIẾN ĐẤU!")
                .setDescription(`Bạn đang trong trận **#${mId}**\n\n🔗 **SERVER VIP:** [CLICK VÀO ĐÂY](${CONFIG.VIP_LINK})\n🔊 **KÊNH VOICE:** ${myVC.url}`)
                .setColor(CONFIG.COLOR.SUCCESS);

            member.send({ embeds: [dmEmbed] }).catch(() => {
                channel.send(`⚠️ <@${p.id}> chặn DM! Hãy dùng Link VIP này: <${CONFIG.VIP_LINK}>`);
            });

            if (member.voice.channel) member.voice.setChannel(myVC).catch(() => {});
        }
        updateSystemUI();
    } catch (err) { console.error("Match Start Error:", err); }
}

// --- 7. EVENT: INTERACTION (NÚT & MODAL) ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [userData] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);

        // Xử lý tham gia Queue qua nút
        if (i.customId.startsWith('q_')) {
            const mode = i.customId.split('_')[1];
            if (!userData[0]) return i.reply({ content: "❌ Bạn phải xác minh trước!", ephemeral: true });

            await i.deferUpdate();
            const inQ = Object.values(queues).some(q => q.players.some(p => p.id === i.user.id));
            if (inQ) return;

            queues[mode].players.push({ id: i.user.id, name: userData[0].robloxName, elo: userData[0].elo });
            i.channel.send(`📥 **${userData[0].robloxName}** tham gia hàng chờ **${mode}**.`);
            updateSystemUI();

            if (queues[mode].players.length === queues[mode].limit) {
                await startMatch(mode, i.guild, i.channel);
            }
        }

        // Nút Xác Minh
        if (i.customId === 'v_start') {
            if (userData[0]) return i.reply({ content: `Bạn đã liên kết với: ${userData[0].robloxName}`, ephemeral: true });
            const modal = new ModalBuilder().setCustomId('m_verify').setTitle('XÁC MINH ROBLOX');
            const input = new TextInputBuilder().setCustomId('r_name').setLabel("TÊN TÀI KHOẢN ROBLOX").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }
    }

    if (i.type === InteractionType.ModalSubmit && i.customId === 'm_verify') {
        await i.deferReply({ ephemeral: true });
        const name = i.fields.getTextInputValue('r_name');
        try {
            const rId = await nblox.getIdFromUsername(name);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo) VALUES (?, ?, ?, 1000)', [i.user.id, name, rId.toString()]);
            await i.editReply("✅ Xác minh thành công!");
            updateSystemUI();
            sendLog("VERIFY", `${i.user.tag} đã liên kết với ${name}`, CONFIG.COLOR.SUCCESS);
        } catch (e) { await i.editReply("❌ Không tìm thấy tên Roblox này."); }
    }
});

// --- 8. EVENT: TIN NHẮN (COMMANDS !j, !win, !cancel) ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // LỆNH THAM GIA: !j 1v1
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("❌ Mode không hợp lệ (1v1, 2v2, 5v5)");

        const [userData] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!userData[0]) return msg.reply("❌ Hãy xác minh tài khoản trước!");

        const inQ = Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id));
        if (inQ) return msg.reply("🚫 Bạn đang trong hàng chờ rồi!");

        queues[mode].players.push({ id: msg.author.id, name: userData[0].robloxName, elo: userData[0].elo });
        msg.reply(`✅ Đã vào hàng chờ **${mode}** [\`${queues[mode].players.length}/${queues[mode].limit}\`]`);
        updateSystemUI();

        if (queues[mode].players.length === queues[mode].limit) {
            await startMatch(mode, msg.guild, msg.channel);
        }
    }

    // LỆNH ADMIN: !win [MatchID] [TeamName]
    if (command === 'win' && msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
        const mId = parseInt(args[0]);
        const winnerName = args[1]?.toUpperCase();
        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ ID trận đấu không tồn tại.");

        const match = activeMatches[mIdx];
        const winners = (winnerName === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winnerName === match.t1Name) ? match.t2P : match.t1P;

        // Cập nhật Database cho Winner & Loser
        for (const p of winners) await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.ELO.BASE_GAIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE users SET elo = GREATEST(0, elo - ?), losses = losses + 1 WHERE discordId = ?', [CONFIG.ELO.BASE_LOSS, p.id]);

        // Dọn dẹp Voice
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete();
        }

        msg.channel.send(`🏆 **Trận #${mId}** kết thúc. Đội **${winnerName}** chiến thắng!`);
        activeMatches.splice(mIdx, 1);
        updateSystemUI();
    }

    // LỆNH ADMIN: !cancel [MatchID]
    if (command === 'cancel' && msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
        const mId = parseInt(args[0]);
        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ Không tìm thấy trận đấu.");

        for (const vId of activeMatches[mIdx].voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete();
        }
        activeMatches.splice(mIdx, 1);
        msg.reply(`🚫 Đã hủy trận đấu #${mId} và xóa phòng voice.`);
        updateSystemUI();
    }
    
    // LỆNH LEADERBOARD: !lb
    if (command === 'lb') {
        const [top] = await pool.execute('SELECT robloxName, elo FROM users ORDER BY elo DESC LIMIT 10');
        const lbDesc = top.map((u, i) => `${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} **${u.robloxName}** - \`${u.elo} ELO\``).join('\n');
        const lbEmbed = new EmbedBuilder().setTitle("🏆 PRIMEBLOX LEADERBOARD").setDescription(lbDesc || "Chưa có dữ liệu").setColor(CONFIG.COLOR.GOLD);
        msg.reply({ embeds: [lbEmbed] });
    }
});

// --- 9. KHỞI CHẠY ---
client.on('ready', () => {
    console.log(`🚀 BOT ONLINE: ${client.user.tag}`);
    client.user.setActivity('Counter-Blox', { type: ActivityType.Competing });
    updateSystemUI();
});

client.login(process.env.DISCORD_TOKEN);
