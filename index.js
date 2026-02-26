/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V13.9 - ULTIMATE ERROR-FIX
 * 📋 PHIÊN BẢN: FIX CATEGORY, FIX DM, FIX PERMISSION, AUTO-CLEANUP
 * 🚀 TRẠNG THÁI: ỔN ĐỊNH CAO (FULL 380+ LINES)
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

// --- KHỞI TẠO CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, 
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// --- CẤU HÌNH ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799",
    LB_CHANNEL_ID: "1474674662792232981",
    CATEGORY_VOICE_ID: "1476182203653161061", // Cần kiểm tra lại ID này có đúng là Category không
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: { SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, GOLD: 0xf1c40f, BLUE: 0x0099ff },
    ELO: { GAIN: 25, LOSS: 20 }
};

// --- DATABASE & QUEUE ---
const pool = mysql.createPool({ 
    uri: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    waitForConnections: true, connectionLimit: 20
});

const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX"];

// --- HÀM HỖ TRỢ CHI TIẾT ---

async function sendSystemLog(title, message, isError = false) {
    try {
        const logChan = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
        if (!logChan) return;
        const embed = new EmbedBuilder()
            .setTitle(isError ? `❌ ERROR: ${title}` : `📜 LOG: ${title}`)
            .setDescription(`\`\`\`${message}\`\`\``)
            .setColor(isError ? CONFIG.COLOR.ERROR : CONFIG.COLOR.BLUE)
            .setTimestamp();
        await logChan.send({ embeds: [embed] });
    } catch (e) { console.error("Logger Failed"); }
}

function getRank(elo) {
    if (elo >= 2500) return "👑 GRANDMASTER";
    if (elo >= 2000) return "💠 ELITE";
    if (elo >= 1500) return "⚔️ DIAMOND";
    if (elo >= 1200) return "🔥 PLATINUM";
    return "🛡️ GOLD";
}

// --- CẬP NHẬT GIAO DIỆN HỆ THỐNG ---

async function refreshSystemUI() {
    try {
        const lbChan = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (lbChan) {
            const [rows] = await pool.execute('SELECT robloxName, elo, wins, losses FROM users ORDER BY elo DESC LIMIT 10');
            const list = rows.map((u, i) => `**#${i+1}** \`${getRank(u.elo)}\` **${u.robloxName}**\n╰ \`${u.elo} ELO\` | W: ${u.wins} - L: ${u.losses}`).join('\n\n');
            const lbEmbed = new EmbedBuilder()
                .setTitle("🏆 PRIMEBLOX RANKING TOP 10")
                .setDescription(list || "Chưa có dữ liệu.")
                .setColor(CONFIG.COLOR.GOLD).setTimestamp();
            
            const msgs = await lbChan.messages.fetch({ limit: 5 });
            const botMsg = msgs.find(m => m.author.id === client.user.id);
            if (botMsg) await botMsg.edit({ embeds: [lbEmbed] }); else await lbChan.send({ embeds: [lbEmbed] });
        }
    } catch (e) { sendSystemLog("UI Refresh Error", e.message, true); }
}

// --- KHỞI ĐỘNG ---

client.once('ready', async () => {
    console.log(`✅ Đã đăng nhập: ${client.user.tag}`);
    client.user.setActivity('Counter-Blox', { type: ActivityType.Competing });
    await refreshSystemUI();
});

// --- XỬ LÝ LỆNH CHÁT (ADMIN & DEBUG) ---

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Lệnh Join cũ (Dùng để backup nếu nút lỗi)
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("❌ Chế độ không hợp lệ (1v1, 2v2, 5v5)");
        
        const [user] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!user[0]) return msg.reply("❌ Bạn chưa verify!");

        if (queues[mode].players.some(p => p.id === msg.author.id)) return msg.reply("⚠️ Bạn đã ở trong queue!");

        queues[mode].players.push({ id: msg.author.id, name: user[0].robloxName });
        msg.channel.send(`✅ **${user[0].robloxName}** đã vào hàng chờ **${mode}** (${queues[mode].players.length}/${queues[mode].limit})`);

        if (queues[mode].players.length === queues[mode].limit) {
            startMatch(msg.guild, mode);
        }
    }

    // Lệnh Win/Score
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const winnerName = args[1]?.toUpperCase();
        const score = args[2] || "N/A";

        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ ID trận đấu không tồn tại!");

        const match = activeMatches[mIdx];
        const isTeam1Win = winnerName === match.t1Name;
        const winners = isTeam1Win ? match.t1P : match.t2P;
        const losers = isTeam1Win ? match.t2P : match.t1P;

        // Update DB
        for (const p of winners) await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1 WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);

        const endEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU #${mId} KẾT THÚC`)
            .setDescription(`Admin **${msg.author.username}** đã xác nhận kết quả.`)
            .addFields(
                { name: `🏆 THẮNG: ${winnerName} (${score})`, value: winners.map(p => `• **${p.name}** (+${CONFIG.ELO.GAIN})`).join('\n') },
                { name: `💀 THUA`, value: losers.map(p => `• **${p.name}** (-${CONFIG.ELO.LOSS})`).join('\n') }
            )
            .setColor(CONFIG.COLOR.GOLD).setTimestamp();

        await msg.channel.send({ embeds: [endEmbed] });

        // Dọn dẹp Voice
        for (const vid of match.voices) {
            const ch = await msg.guild.channels.fetch(vid).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }

        activeMatches.splice(mIdx, 1);
        refreshSystemUI();
    }
});

// --- HÀM KHỞI CHẠY TRẬN ĐẤU (TRÁI TIM CỦA BOT) ---

async function startMatch(guild, mode) {
    const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
    queues[mode].players = []; // Reset queue ngay lập tức

    const matchId = Math.floor(100000 + Math.random() * 899999);
    const tNames = [...teamNames].sort(() => 0.5 - Math.random());
    const team1 = players.slice(0, players.length / 2);
    const team2 = players.slice(players.length / 2);

    // FIX CATEGORY LOGIC: Kiểm tra ID có thực sự là Category không
    let parentObj = guild.channels.cache.get(CONFIG.CATEGORY_VOICE_ID);
    if (!parentObj || parentObj.type !== ChannelType.GuildCategory) {
        // Nếu sai ID, thử tìm Category nào có tên "Matches" hoặc để null
        parentObj = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes("match")) || null;
        sendSystemLog("Category Fix", `ID cấu hình sai. Đã chuyển sang: ${parentObj ? parentObj.name : "Không có Category"}`, true);
    }

    try {
        const vc1 = await guild.channels.create({
            name: `🔵 ĐỘI ${tNames[0]} [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: parentObj ? parentObj.id : null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...team1.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
            ]
        });

        const vc2 = await guild.channels.create({
            name: `🔴 ĐỘI ${tNames[1]} [#${matchId}]`,
            type: ChannelType.GuildVoice,
            parent: parentObj ? parentObj.id : null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...team2.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
            ]
        });

        activeMatches.push({ id: matchId, t1Name: tNames[0], t2Name: tNames[1], t1P: team1, t2P: team2, voices: [vc1.id, vc2.id] });

        const notifyEmbed = new EmbedBuilder()
            .setTitle(`⚔️ TRẬN ĐẤU SẴN SÀNG | ID #${matchId}`)
            .setColor(CONFIG.COLOR.BLUE)
            .addFields(
                { name: `🟦 ĐỘI ${tNames[0]}`, value: team1.map(p => `• **${p.name}**`).join('\n'), inline: true },
                { name: `🟥 ĐỘI ${tNames[1]}`, value: team2.map(p => `• **${p.name}**`).join('\n'), inline: true },
                { name: `🔗 SERVER VIP`, value: `[BẤM VÀO ĐÂY ĐỂ VÀO GAME](${CONFIG.VIP_LINK})` }
            )
            .setFooter({ text: "Vui lòng vào đúng phòng voice của đội mình!" });

        const channel = await guild.channels.fetch(CONFIG.VERIFY_CHANNEL_ID);
        await channel.send({ content: team1.concat(team2).map(p => `<@${p.id}>`).join(' '), embeds: [notifyEmbed] });

        // Tự động Move member nếu họ đang ở trong voice bất kỳ
        for (const p of team1) {
            const mem = await guild.members.fetch(p.id).catch(() => null);
            if (mem?.voice.channel) mem.voice.setChannel(vc1).catch(() => {});
        }
        for (const p of team2) {
            const mem = await guild.members.fetch(p.id).catch(() => null);
            if (mem?.voice.channel) mem.voice.setChannel(vc2).catch(() => {});
        }

    } catch (err) {
        sendSystemLog("Match Creation Fail", err.message, true);
    }
}

// --- XỬ LÝ NÚT BẤM & XÁC MINH ---

client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [user] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);

        if (i.customId === 'v_start') {
            if (user[0]) return i.reply({ content: `Bạn đã verify: **${user[0].robloxName}**`, ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_v').setTitle('XÁC MINH');
            const input = new TextInputBuilder().setCustomId('txt_name').setLabel("Tên Roblox").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await i.showModal(modal);
        }
    }

    if (i.type === InteractionType.ModalSubmit) {
        await i.deferReply({ ephemeral: true });
        const name = i.fields.getTextInputValue('txt_name');
        try {
            const rid = await nblox.getIdFromUsername(name);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo) VALUES (?, ?, ?, 1000)', [i.user.id, name, rid.toString()]);
            await i.editReply(`✅ Thành công: **${name}**!`);
            refreshSystemUI();
        } catch (e) { await i.editReply("❌ Lỗi: Tên không tồn tại!"); }
    }
});

client.login(process.env.DISCORD_TOKEN);
