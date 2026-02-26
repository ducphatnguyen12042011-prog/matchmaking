/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V13.9 - ULTIMATE GRANDMASTER
 * 📋 FIX: AUTO-DELETE VOICE, HISTORY ID CHANNEL, DM RESULT EMBED
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

// --- CẤU HÌNH HỆ THỐNG ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799",
    LB_CHANNEL_ID: "1474674662792232981", 
    HISTORY_CHANNEL_ID: "1476233898500292740", // Kênh lưu lịch sử (Không tag)
    CATEGORY_VOICE_ID: "1476182203653161061",
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg",
    MAPS: ["Dust 2", "Mirage", "Inferno", "Cache", "Overpass", "Train", "Nuke"],
    COLOR: { SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, GOLD: 0xf1c40f, PURPLE: 0x9b59b6 },
    ELO: { GAIN: 25, LOSS: 20 }
};

let pool;
const queues = { "1v1": { players: [], limit: 2 }, "2v2": { players: [], limit: 4 }, "5v5": { players: [], limit: 10 } };
let activeMatches = new Collection();
const cooldowns = new Set();
const teamNames = ["TITAN", "DIRE", "ALPHA", "OMEGA", "RADIANT", "STORM", "PHOENIX", "SHADOW"];

// --- KHỞI TẠO DATABASE ---
async function initDB() {
    try {
        pool = mysql.createPool({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, waitForConnections: true, connectionLimit: 20 });
        console.log("✅ Database Connected!");
    } catch (e) { console.error("❌ DB Error:", e); }
}

// --- HÀM RANK ---
function getRankTier(elo) {
    if (elo >= 2500) return "👑 GRANDMASTER";
    if (elo >= 1500) return "⚔️ DIAMOND";
    if (elo >= 1000) return "🛡️ GOLD";
    return "🎗️ SILVER";
}

// --- CẬP NHẬT BXH ---
async function updateAutoLB() {
    try {
        const channel = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        const [top] = await pool.execute('SELECT robloxName, elo, wins, losses, streak FROM users ORDER BY elo DESC LIMIT 10');
        const lbEntries = top.map((u, i) => `**#${i+1}** ${u.robloxName} | \`${u.elo}\` ELO | ${u.wins}W/${u.losses}L | *${getRankTier(u.elo)}*`);
        const embed = new EmbedBuilder().setTitle("🏆 TOP 10 PRIMEBLOX GLADIATORS").setDescription(lbEntries.join('\n\n') || "Chưa có dữ liệu.").setColor(CONFIG.COLOR.GOLD);
        const msgs = await channel.messages.fetch({ limit: 10 });
        const botMsg = msgs.find(m => m.author.id === client.user.id);
        if (botMsg) await botMsg.edit({ embeds: [embed] }); else await channel.send({ embeds: [embed] });
    } catch (err) { console.log("LB Update Error"); }
}

// --- EVENT READY (TỰ ĐỘNG GỬI VERIFY VÀO ID KÊNH) ---
client.on('ready', async () => {
    await setupDatabase();
    client.user.setActivity('Ranked V13.9', { type: ActivityType.Watching });
    console.log(`🚀 Bot ready: ${client.user.tag}`);

    // 1. Tự động cập nhật Leaderboard
    updateLeaderboard();

    // 2. TỰ ĐỘNG GỬI BẢNG VERIFY VÀO ID KÊNH (1476202572594548799)
    try {
        const vChan = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID).catch(() => null);
        if (vChan) {
            // Dọn dẹp tin nhắn cũ của Bot để tránh spam
            const oldMsgs = await vChan.messages.fetch({ limit: 10 });
            const botMsgs = oldMsgs.filter(m => m.author.id === client.user.id);
            if (botMsgs.size > 0) await vChan.bulkDelete(botMsgs).catch(() => {});

            // Gửi bảng Verify mới - AI CŨNG BẤM ĐƯỢC
            const embed = new EmbedBuilder()
                .setTitle("🛡️ PRIMEBLOX SECURITY & VERIFICATION")
                .setDescription("Chào mừng chiến binh! Nhấn nút bên dưới để bắt đầu tham gia hệ thống Rank.\n\n✅ **Xác Minh:** Liên kết tài khoản Roblox.\n🔄 **Đổi Tên:** Cập nhật lại tên nếu bạn thay đổi tên Roblox.\n🗑️ **Unlink:** Xóa dữ liệu liên kết.")
                .setColor(CONFIG.COLOR.PURPLE)
                .setImage(CONFIG.BANNER_URL)
                .setFooter({ text: "Hệ thống xác minh tự động hoạt động 24/7" });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_v').setLabel('Xác Minh').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('btn_c').setLabel('Đổi Tên').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('btn_u').setLabel('Unlink').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
            );

            await vChan.send({ embeds: [embed], components: [row] });
            console.log("✅ [SYSTEM] Đã tự động gửi bảng Verify vào kênh ID.");
        }
    } catch (err) {
        console.error("❌ [ERROR] Không thể gửi bảng Verify tự động:", err);
    }
});

    // 2. JOIN MATCH
    if (command === 'j' || command === 'join') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("!j [1v1/2v2/5v5]");
        const [u] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!u[0]) return msg.reply("Chưa xác minh!");
        if (Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id))) return msg.reply("Đã ở trong hàng chờ!");

        queues[mode].players.push({ id: msg.author.id, name: u[0].robloxName, elo: u[0].elo });
        msg.channel.send(`📥 **${u[0].robloxName}** (\`${u[0].elo}\`) tham gia **${mode}** (${queues[mode].players.length}/${queues[mode].limit})`);

        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players]; queues[mode].players = [];
            const mId = Math.floor(100000 + Math.random() * 899999);
            const map = CONFIG.MAPS[Math.floor(Math.random() * CONFIG.MAPS.length)];
            const tNames = teamNames.sort(() => 0.5 - Math.random());
            const t1 = players.slice(0, players.length / 2); const t2 = players.slice(players.length / 2);

            const parent = msg.guild.channels.cache.get(CONFIG.CATEGORY_VOICE_ID);
            const pId = (parent?.type === ChannelType.GuildCategory) ? CONFIG.CATEGORY_VOICE_ID : null;

            const vc1 = await msg.guild.channels.create({ 
                name: `🔊 ${tNames[0]} [#${mId}]`, 
                type: ChannelType.GuildVoice, 
                parent: pId,
                permissionOverwrites: [
                    { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
                    ...t1.map(m => ({ id: m.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                ]
            });
            const vc2 = await msg.guild.channels.create({ 
                name: `🔊 ${tNames[1]} [#${mId}]`, 
                type: ChannelType.GuildVoice, 
                parent: pId,
                permissionOverwrites: [
                    { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
                    ...t2.map(m => ({ id: m.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                ]
            });

            activeMatches.set(mId, { id: mId, mode, map, t1P: t1, t1N: tNames[0], t2P: t2, t2N: tNames[1], voices: [vc1.id, vc2.id] });

            const startEmbed = new EmbedBuilder()
                .setTitle(`⚔️ TRẬN ĐẤU BẮT ĐẦU | ID: #${mId}`)
                .addFields(
                    { name: `🟦 Đội ${tNames[0]}`, value: t1.map(p => `• ${p.name}`).join('\n'), inline: true },
                    { name: `🟥 Đội ${tNames[1]}`, value: t2.map(p => `• ${p.name}`).join('\n'), inline: true },
                    { name: "🗺️ Bản Đồ", value: `\`${map}\`` }
                ).setColor(CONFIG.COLOR.GOLD).setImage(CONFIG.BANNER_URL);

            msg.channel.send({ content: "@everyone", embeds: [startEmbed] });

            [...t1, ...t2].forEach(async (p) => {
                const mem = await msg.guild.members.fetch(p.id).catch(() => null);
                if (mem) {
                    if (mem.voice.channel) mem.voice.setChannel(t1.includes(p) ? vc1 : vc2).catch(() => {});
                    mem.send({ embeds: [new EmbedBuilder().setTitle("🛡️ PRIMEBLOX MATCH NOTIFICATION").setDescription(`Trận #${mId} của bạn bắt đầu!\n\n🔗 [SERVER VIP](${CONFIG.VIP_LINK})\n🔊 **PHÒNG CHỜ:** ${t1.includes(p) ? tNames[0] : tNames[1]}`).setColor(CONFIG.COLOR.SUCCESS)] }).catch(() => {});
                }
            });
        }
    }

    // 3. LỆNH WIN (ADMIN) - GỬI LỊCH SỬ VÀO ID KÊNH & DM NGƯỜI CHƠI
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const winnerSide = args[1]?.toUpperCase();
        const match = activeMatches.get(mId);
        if (!match) return msg.reply("Trận đấu không tồn tại!");

        const winners = (winnerSide === match.t1N) ? match.t1P : match.t2P;
        const losers = (winnerSide === match.t1N) ? match.t2P : match.t1P;

        await Promise.all([
            ...winners.map(p => pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1, streak = IF(streak < 0, 1, streak + 1) WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id])),
            ...losers.map(p => pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1, streak = IF(streak > 0, -1, streak - 1) WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]))
        ]);

        // GỬI LỊCH SỬ VÀO ID KÊNH (1476233898500292740 - KHÔNG TAG)
        const histEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU KẾT THÚC | ID: #${mId}`)
            .addFields(
                { name: `🟦 Đội ${match.t1N}`, value: match.t1P.map(p => p.name).join('\n'), inline: true },
                { name: `🟥 Đội ${match.t2N}`, value: match.t2P.map(p => p.name).join('\n'), inline: true },
                { name: "🏆 KẾT QUẢ", value: `Đội **${winnerSide}** thắng!` },
                { name: "🗺️ Bản Đồ", value: `\`${match.map}\`` }
            ).setColor(CONFIG.COLOR.GOLD).setImage(CONFIG.BANNER_URL).setTimestamp();
        
        const histChan = await client.channels.fetch(CONFIG.HISTORY_CHANNEL_ID).catch(() => null);
        if (histChan) histChan.send({ embeds: [histEmbed] });

        // GỬI DM KẾT QUẢ CHO NGƯỜI CHƠI
        const winDM = new EmbedBuilder().setTitle("🏁 KẾT QUẢ TRẬN ĐẤU").setDescription(`Trận đấu **#${mId}** đã kết thúc!\n\n🏆 **TRẠNG THÁI:** CHIẾN THẮNG\n📈 **ELO:** +${CONFIG.ELO.GAIN}`).setColor(CONFIG.COLOR.SUCCESS).setTimestamp();
        const lossDM = new EmbedBuilder().setTitle("🏁 KẾT QUẢ TRẬN ĐẤU").setDescription(`Trận đấu **#${mId}** đã kết thúc!\n\n💀 **TRẠNG THÁI:** THẤT BẠI\n📉 **ELO:** -${CONFIG.ELO.LOSS}`).setColor(CONFIG.COLOR.ERROR).setTimestamp();
        
        winners.forEach(async p => { const m = await msg.guild.members.fetch(p.id).catch(() => null); if(m) m.send({ embeds: [winDM] }).catch(() => {}); });
        losers.forEach(async p => { const m = await msg.guild.members.fetch(p.id).catch(() => null); if(m) m.send({ embeds: [lossDM] }).catch(() => {}); });

        // XÓA VOICE TRIỆT ĐỂ
        setTimeout(async () => {
            for (const v of match.voices) {
                const c = await msg.guild.channels.fetch(v).catch(() => null);
                if (c) await c.delete().catch(() => {});
            }
        }, 2000);

        activeMatches.delete(mId);
        msg.reply(`✅ Kết thúc trận #${mId}. Đã gửi báo cáo vào <#${CONFIG.HISTORY_CHANNEL_ID}> và DM người chơi.`);
        updateAutoLB();
    }
});

// --- INTERACTIONS ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        if (i.customId === 'v_start') {
            const modal = new ModalBuilder().setCustomId('mod_v').setTitle('XÁC MINH');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r_n').setLabel("Tên Roblox").setStyle(TextInputStyle.Short)));
            await i.showModal(modal);
        }
        if (i.customId === 'v_unlink') { await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]); i.reply({ content: "Đã unlink!", ephemeral: true }); }
    }
    if (i.type === InteractionType.ModalSubmit) {
        await i.deferReply({ ephemeral: true });
        const name = i.fields.getTextInputValue('r_n');
        try {
            const rid = await nblox.getIdFromUsername(name);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo) VALUES (?, ?, ?, 1000) ON DUPLICATE KEY UPDATE robloxName = ?', [i.user.id, name, rid.toString(), name]);
            await i.editReply(`✅ Đã xác minh: ${name}`);
            updateAutoLB();
        } catch (e) { await i.editReply("Lỗi xác minh!"); }
    }
});

client.login(process.env.DISCORD_TOKEN);
